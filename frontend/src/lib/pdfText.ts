import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Same worker wiring as FilledPdfView. pdf.js needs its worker URL set once,
// module-side, before any getDocument() call.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/**
 * Extract the text of a PDF in the browser (#47). Uploading a PDF used to be
 * sent to the extractor as an `image_data_url`, but vision models can't read a
 * raw `application/pdf` data URL, so the request 400'd. For a digital (text)
 * PDF we pull the text here and send it as `input_type:'text'` instead.
 *
 * Returns '' for a scanned/image-only PDF (no embedded text) — callers should
 * fall back to `renderPdfFirstPageToPng` for those.
 */
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const lines: string[] = []
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      let line = ''
      for (const item of content.items) {
        // TextMarkedContent entries have no `str`; skip them.
        if (!('str' in item)) continue
        line += item.str
        // pdf.js flags the end of a visual line — preserve it so the menu
        // parser (which is line-oriented: "name … $price") sees real rows.
        if (item.hasEOL) {
          if (line.trim()) lines.push(line.trim())
          line = ''
        } else {
          line += ' '
        }
      }
      if (line.trim()) lines.push(line.trim())
    }
    return lines.join('\n').replace(/[ \t]+/g, ' ').trim()
  } finally {
    void loadingTask.destroy()
  }
}

/**
 * Rasterize page 1 of a PDF to a PNG data URL, for scanned/image-only PDFs that
 * carry no extractable text. A PNG data URL IS a valid vision input, so this
 * feeds the existing `input_type:'image'` extractor path.
 */
export async function renderPdfFirstPageToPng(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    // Cap the long edge so the data URL stays modest (<~8 MB upload limit).
    const scale = Math.min(1600 / Math.max(base.width, base.height), 2)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) throw new Error('canvas unavailable')
    await page.render({ canvasContext, viewport, canvas }).promise
    return canvas.toDataURL('image/png')
  } finally {
    void loadingTask.destroy()
  }
}
