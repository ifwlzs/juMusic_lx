import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const EXPORT_SAFE_OVERRIDE_ATTRIBUTE = 'data-export-safe-overrides'
const EXPORT_MODE_CLASS = 'pdf-export-mode'
const EXPORT_SURFACE_BACKGROUND = '#f7f4ee'

export function buildYearReportPdfFileName(year) {
  const resolvedYear = Number(year) || 0
  return `juMusic-${resolvedYear}-年度报告.pdf`
}

export async function exportReportPagesToPdf({ exportPages, pageElementMap, year, onProgress }) {
  let pdf = null

  for (const [index, page] of exportPages.entries()) {
    const pageElement = pageElementMap.get(page.page_id)
    if (!pageElement) {
      throw new Error(`未找到页面节点：${page.page_id}`)
    }

    onProgress?.({
      current: index + 1,
      total: exportPages.length,
      pageId: page.page_id,
    })

    const canvas = await html2canvas(
      pageElement,
      buildHtml2CanvasOptions(pageElement, (clonedDocument) => {
        // html2canvas 目前会在解析部分 CSS Color 4 函数时报错，这里在克隆文档中注入导出专用安全样式。
        prepareClonedDocumentForPdf(clonedDocument)
      }),
    )
    const pageFormat = resolvePdfPageFormat(pageElement)
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.96)
    if (!pdf) {
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [pageFormat.width, pageFormat.height],
        compress: true,
      })
    } else {
      pdf.addPage([pageFormat.width, pageFormat.height], 'portrait')
    }
    pdf.addImage(imageDataUrl, 'JPEG', 0, 0, pageFormat.width, pageFormat.height)
  }

  pdf?.save(buildYearReportPdfFileName(year))
}

export function prepareClonedDocumentForPdf(clonedDocument) {
  if (!clonedDocument?.documentElement || !clonedDocument?.head) {
    return
  }

  clonedDocument.documentElement.classList.add(EXPORT_MODE_CLASS)
  const previousStyle = clonedDocument.head.querySelector(`[${EXPORT_SAFE_OVERRIDE_ATTRIBUTE}="true"]`)
  if (previousStyle) {
    previousStyle.remove()
  }

  const styleElement = clonedDocument.createElement('style')
  styleElement.setAttribute(EXPORT_SAFE_OVERRIDE_ATTRIBUTE, 'true')
  styleElement.textContent = buildExportSafeOverrideCss()
  clonedDocument.head.appendChild(styleElement)
}

export function buildExportSafeOverrideCss() {
  // 这里避免使用 color-mix / color() 等 html2canvas 尚不稳定支持的颜色函数。
  return `
    .${EXPORT_MODE_CLASS},
    .${EXPORT_MODE_CLASS} body {
      background: ${EXPORT_SURFACE_BACKGROUND} !important;
    }

    .${EXPORT_MODE_CLASS} .report-page {
      min-height: auto !important;
      height: auto !important;
      background: ${EXPORT_SURFACE_BACKGROUND} !important;
      overflow: visible !important;
    }

    .${EXPORT_MODE_CLASS} .page-shell {
      min-height: auto !important;
    }

    .${EXPORT_MODE_CLASS} .report-page::before {
      background:
        radial-gradient(circle at top left, rgba(217, 75, 72, 0.16), transparent 34%),
        radial-gradient(circle at 88% 18%, rgba(94, 127, 166, 0.12), transparent 24%),
        linear-gradient(180deg, var(--page-background-start), var(--page-background-end)) !important;
    }

    .${EXPORT_MODE_CLASS} .hero-title,
    .${EXPORT_MODE_CLASS} .score-hero-value {
      color: var(--page-accent-strong) !important;
    }

    .${EXPORT_MODE_CLASS} .cover-block,
    .${EXPORT_MODE_CLASS} .story-card,
    .${EXPORT_MODE_CLASS} .ranking-panel,
    .${EXPORT_MODE_CLASS} .metric-card,
    .${EXPORT_MODE_CLASS} .timeline-item,
    .${EXPORT_MODE_CLASS} .time-preference-hero-card,
    .${EXPORT_MODE_CLASS} .time-bucket-card,
    .${EXPORT_MODE_CLASS} .time-hour-pill,
    .${EXPORT_MODE_CLASS} .hero-meta-band,
    .${EXPORT_MODE_CLASS} .score-meta-band,
    .${EXPORT_MODE_CLASS} .album-spotlight-card,
    .${EXPORT_MODE_CLASS} .page-summary-card {
      background: rgba(255, 255, 255, 0.88) !important;
    }

    .${EXPORT_MODE_CLASS} .cover-block--soft {
      background:
        radial-gradient(circle at top left, rgba(217, 75, 72, 0.18), transparent 40%),
        linear-gradient(180deg, #ffffff, #f8f2ff) !important;
    }

    .${EXPORT_MODE_CLASS} .cover-block--album {
      background:
        radial-gradient(circle at 15% 18%, rgba(255, 184, 108, 0.18), transparent 34%),
        linear-gradient(180deg, #fff7eb, #ffffff) !important;
    }

    .${EXPORT_MODE_CLASS} .cover-block--song {
      background:
        radial-gradient(circle at 78% 18%, rgba(115, 212, 201, 0.18), transparent 34%),
        linear-gradient(180deg, #eefcf8, #ffffff) !important;
    }

    .${EXPORT_MODE_CLASS} .score-hero-card {
      background:
        radial-gradient(circle at top right, rgba(115, 212, 201, 0.16), transparent 28%),
        linear-gradient(180deg, #f6fffd, rgba(255, 255, 255, 0.92)) !important;
    }

    .${EXPORT_MODE_CLASS} .story-card--focus,
    .${EXPORT_MODE_CLASS} .ranking-panel--accent {
      background:
        linear-gradient(180deg, rgba(245, 248, 255, 0.94), rgba(255, 255, 255, 0.90)) !important;
    }
  `
}

export function buildHtml2CanvasOptions(pageElement, onclone) {
  return {
    useCORS: true,
    allowTaint: false,
    backgroundColor: EXPORT_SURFACE_BACKGROUND,
    scale: 2,
    logging: false,
    // 导出时按页面真实尺寸抓取，确保像 L04 这种实际更高的页面也能完整展开。
    windowWidth: Math.ceil(pageElement.scrollWidth),
    windowHeight: Math.ceil(pageElement.scrollHeight),
    width: Math.ceil(pageElement.scrollWidth),
    height: Math.ceil(pageElement.scrollHeight),
    onclone,
    scrollX: 0,
    scrollY: 0,
  }
}

export function resolvePdfPageFormat(pageElement) {
  return {
    width: Math.ceil(pageElement.scrollWidth),
    height: Math.ceil(pageElement.scrollHeight),
  }
}
