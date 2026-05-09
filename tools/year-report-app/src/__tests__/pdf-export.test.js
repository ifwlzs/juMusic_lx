import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  buildExportSafeOverrideCss,
  buildHtml2CanvasOptions,
  prepareClonedDocumentForPdf,
  resolvePdfPageFormat,
} from '../lib/pdfExport.js'

describe('pdf export sanitization', () => {
  it('导出覆盖样式不能再包含 html2canvas 不支持的 color 函数', () => {
    const cssText = buildExportSafeOverrideCss()

    expect(cssText).not.toContain('color-mix(')
    expect(cssText).not.toContain('color(')
    expect(cssText).toContain('.hero-title')
    expect(cssText).toContain('.score-hero-card')
    expect(cssText).toContain('.ranking-panel')
  })

  it('导出覆盖样式需要显式兜住 P19 的 time-preference hero 卡，避免残留 color-mix 进入 html2canvas', () => {
    const cssText = buildExportSafeOverrideCss()

    expect(cssText).toContain('.time-preference-hero-card')
    expect(cssText).not.toContain('color-mix(')
    expect(cssText).not.toContain('color(')
  })

  it('导出前会给克隆文档注入安全样式并打上导出模式标记', () => {
    const dom = new JSDOM(`
      <html>
        <head></head>
        <body>
          <section class="report-page" data-page-id="P01"></section>
        </body>
      </html>
    `)

    prepareClonedDocumentForPdf(dom.window.document)

    expect(dom.window.document.documentElement.classList.contains('pdf-export-mode')).toBe(true)
    const injectedStyle = dom.window.document.head.querySelector('[data-export-safe-overrides="true"]')
    expect(injectedStyle).not.toBeNull()
    expect(injectedStyle.textContent).not.toContain('color-mix(')
  })

  it('导出覆盖样式不会再定死页面尺寸，而是允许页面按真实高度完整展开', () => {
    const cssText = buildExportSafeOverrideCss()

    expect(cssText).not.toContain('width: 390px')
    expect(cssText).not.toContain('height: 844px')
    expect(cssText).toContain('height: auto')
    expect(cssText).toContain('overflow: visible')
    expect(cssText).toContain('#f7f4ee')
  })

  it('html2canvas 导出参数会按页面真实尺寸截图，并显式使用米白背景', () => {
    const fakeElement = {
      scrollWidth: 320,
      scrollHeight: 1260,
    }
    const options = buildHtml2CanvasOptions(fakeElement, () => {})

    expect(options.backgroundColor).toBe('#f7f4ee')
    expect(options.windowWidth).toBe(320)
    expect(options.windowHeight).toBe(1260)
    expect(options.width).toBe(320)
    expect(options.height).toBe(1260)
  })

  it('PDF 页面尺寸会跟随实际页面尺寸，避免长页被压缩进固定高度', () => {
    const pageFormat = resolvePdfPageFormat({
      scrollWidth: 390,
      scrollHeight: 1260,
    })

    expect(pageFormat).toEqual({
      width: 390,
      height: 1260,
    })
  })
})
