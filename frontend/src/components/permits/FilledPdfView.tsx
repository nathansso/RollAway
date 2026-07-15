import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fetchFormPdf, fillFormPdf } from '../../lib/pdfFill'
import { hasPdfFieldMap } from '../../lib/pdfFieldMaps'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type Status = 'loading' | 'ready' | 'unsupported' | 'error'

// Renders the REAL agency PDF, auto-filled from the vendor's data, on the page. Fetches the verified
// PDF via the runtime proxy (agency hosts have no CORS), fills the AcroForm with pdf-lib (fields stay
// editable — not flattened), then RASTERIZES it to <canvas> with pdf.js. Rendering to canvas (rather
// than embedding a blob PDF in an <iframe>, which Chromium auto-DOWNLOADS) means nothing downloads on
// load — the filled PDF only downloads when the user clicks Download. Falls back to a link on error.
export default function FilledPdfView({
  source,
  values,
  formName,
  formUrl,
  canDownload,
  onDownload,
  rawValues = {},
  pdfFieldValue,
  onPdfFieldInput,
}: {
  source: string
  values: Record<string, string>
  formName: string
  formUrl: string
  canDownload: boolean
  onDownload: () => void
  // #48.2: manual entries by raw AcroForm field name, folded into the fill.
  rawValues?: Record<string, string>
  // Current value to show in a field's editable overlay (mapped or manual).
  pdfFieldValue?: (pdfFieldName: string) => string
  // Commit an in-PDF edit; when provided, the PDF renders click-to-type fields.
  onPdfFieldInput?: (pdfFieldName: string, value: string) => void
}) {
  const [status, setStatus] = useState<Status>('loading')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const urlRef = useRef<string | null>(null)
  const downloadName = `${formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'permit-form'}-filled.pdf`
  // Re-fill/re-render whenever the supplied values change (user completes a field).
  const valuesKey = JSON.stringify({ values, rawValues })
  const editable = typeof onPdfFieldInput === 'function'

  useEffect(() => {
    if (!hasPdfFieldMap(source)) {
      setStatus('unsupported')
      return
    }
    let cancelled = false
    setStatus('loading')
    setError(null)
    ;(async () => {
      try {
        const bytes = await fetchFormPdf(source)
        const filled = await fillFormPdf(source, values, bytes, rawValues)
        if (cancelled) return
        // Blob kept only for the click-only Download link — never navigated to.
        const blob = new Blob([filled as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setDownloadUrl(url)

        // Rasterize with pdf.js (getDocument detaches its buffer, so hand it a copy).
        const loadingTask = pdfjsLib.getDocument({ data: filled.slice() })
        const doc = await loadingTask.promise
        const container = containerRef.current
        if (cancelled || !container) {
          void loadingTask.destroy()
          return
        }
        container.replaceChildren()
        const width = container.clientWidth || 600
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const editable = typeof onPdfFieldInput === 'function'
        for (let p = 1; p <= doc.numPages; p += 1) {
          if (cancelled) break
          const page = await doc.getPage(p)
          const base = page.getViewport({ scale: 1 })
          const scale = Math.min(width / base.width, 2)
          const viewport = page.getViewport({ scale: scale * dpr })
          // Each page is a positioned wrapper so editable field inputs can be
          // overlaid on top of the rasterized canvas at their AcroForm rects.
          const pageEl = document.createElement('div')
          pageEl.style.position = 'relative'
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.className = 'rounded border border-border bg-white'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          pageEl.appendChild(canvas)
          container.appendChild(pageEl)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise

          // #48.2: overlay a click-to-type input over each visible text field.
          if (editable) {
            const annotations = await page.getAnnotations({ intent: 'display' })
            for (const annotation of annotations) {
              if (annotation.fieldType !== 'Tx' || annotation.hidden || annotation.readOnly) continue
              const name: string = annotation.fieldName ?? ''
              if (!name) continue
              // pdf.js v6 dropped viewport.convertToViewportRectangle(); convert
              // the rect's two opposite corners instead (what it did internally).
              const [x1, y1, x2, y2] = annotation.rect as [number, number, number, number]
              const [rx1, ry1] = viewport.convertToViewportPoint(x1, y1)
              const [rx2, ry2] = viewport.convertToViewportPoint(x2, y2)
              const left = Math.min(rx1, rx2)
              const top = Math.min(ry1, ry2)
              const w = Math.abs(rx2 - rx1)
              const h = Math.abs(ry2 - ry1)
              const input = document.createElement('input')
              input.type = 'text'
              input.value = pdfFieldValue ? pdfFieldValue(name) : ''
              input.setAttribute('aria-label', name)
              // Percentages keep the overlay aligned as the canvas scales with
              // its container; the wrapper shares the viewport's aspect ratio.
              input.style.position = 'absolute'
              input.style.left = `${(left / viewport.width) * 100}%`
              input.style.top = `${(top / viewport.height) * 100}%`
              input.style.width = `${(w / viewport.width) * 100}%`
              input.style.height = `${(h / viewport.height) * 100}%`
              // Opaque so the input's value masks the canvas text beneath it.
              input.style.background = 'rgba(255,255,255,0.96)'
              input.style.border = '1px solid rgba(37,99,235,0.35)'
              input.style.borderRadius = '2px'
              input.style.padding = '0 2px'
              input.style.margin = '0'
              input.style.color = '#111'
              input.style.boxSizing = 'border-box'
              input.style.fontSize = `${Math.max(8, Math.min(16, (h / dpr) * 0.62))}px`
              input.addEventListener('change', () => onPdfFieldInput?.(name, input.value))
              pageEl.appendChild(input)
            }
          }
        }
        void loadingTask.destroy()
        if (!cancelled) setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load the form PDF.')
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, valuesKey])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-foreground">Your auto-filled official form</p>
      {editable && (
        <p className="text-xs text-muted-foreground">
          Click any field on the form to type or correct a value — it’s saved into your download.
        </p>
      )}

      {status === 'loading' && (
        <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-border bg-white text-sm text-muted-foreground">
          Loading and filling the official PDF…
        </div>
      )}

      {/* Always mounted and laid out (so pdf.js can measure its width); empty until pages are drawn. */}
      <div
        ref={containerRef}
        aria-label={`Auto-filled ${formName} preview`}
        className="mt-2 max-h-[70vh] space-y-2 overflow-auto empty:mt-0"
      />

      {status === 'ready' && downloadUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={canDownload ? downloadUrl : undefined}
            download={canDownload ? downloadName : undefined}
            aria-disabled={!canDownload}
            onClick={(event) => {
              if (!canDownload) {
                event.preventDefault()
                return
              }
              onDownload()
            }}
            className={`easyapply-button ${canDownload ? '' : 'pointer-events-none opacity-45'}`}
          >
            Download filled PDF
            <span className="sr-only"> for {formName}</span>
          </a>
          {!canDownload && (
            <span className="text-xs text-muted-foreground">Fill the required fields to download.</span>
          )}
        </div>
      )}

      {(status === 'error' || status === 'unsupported') && (
        <div className="mt-2 rounded-lg border border-caution/30 bg-caution/10 p-3 text-sm text-foreground">
          {status === 'unsupported'
            ? 'A pre-filled preview isn’t available for this form yet.'
            : `Couldn’t load the official PDF here (${error}).`}{' '}
          <a href={formUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
            Open the official form
          </a>{' '}
          and use the field values above.
        </div>
      )}
    </div>
  )
}
