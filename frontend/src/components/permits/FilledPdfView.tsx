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
}: {
  source: string
  values: Record<string, string>
  formName: string
  formUrl: string
  canDownload: boolean
  onDownload: () => void
}) {
  const [status, setStatus] = useState<Status>('loading')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const urlRef = useRef<string | null>(null)
  const downloadName = `${formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'permit-form'}-filled.pdf`
  // Re-fill/re-render whenever the supplied values change (user completes a field).
  const valuesKey = JSON.stringify(values)

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
        const filled = await fillFormPdf(source, values, bytes)
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
        for (let p = 1; p <= doc.numPages; p += 1) {
          if (cancelled) break
          const page = await doc.getPage(p)
          const base = page.getViewport({ scale: 1 })
          const scale = Math.min(width / base.width, 2)
          const viewport = page.getViewport({ scale: scale * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.className = 'rounded border border-border bg-white'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          container.appendChild(canvas)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
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
