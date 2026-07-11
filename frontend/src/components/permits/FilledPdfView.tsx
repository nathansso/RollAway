import { useEffect, useRef, useState } from 'react'
import { fetchFormPdf, fillFormPdf } from '../../lib/pdfFill'
import { hasPdfFieldMap } from '../../lib/pdfFieldMaps'

type Status = 'loading' | 'ready' | 'unsupported' | 'error'

// Renders the REAL agency PDF, auto-filled from the vendor's data, on the page. Fetches the verified
// PDF via the runtime proxy (agency hosts have no CORS), fills the AcroForm with pdf-lib (fields stay
// editable — not flattened), and shows the result in an <iframe> with a Download. Falls back to a
// link if the PDF can't be loaded.
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const downloadName = `${formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'permit-form'}-filled.pdf`
  // Re-fill whenever the supplied values change (user completes a field).
  const valuesKey = JSON.stringify(values)
  const urlRef = useRef<string | null>(null)

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
        const blob = new Blob([filled as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPdfUrl(url)
        setStatus('ready')
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

      {status === 'ready' && pdfUrl && (
        <>
          <iframe
            src={pdfUrl}
            title={`Auto-filled ${formName}`}
            className="mt-2 h-[60vh] w-full rounded-lg border border-border bg-white"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={canDownload ? pdfUrl : undefined}
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
        </>
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
