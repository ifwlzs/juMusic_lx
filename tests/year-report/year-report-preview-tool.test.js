const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// 统一定位仓库根目录，避免测试依赖执行时的当前工作目录。
const repoRoot = path.resolve(__dirname, '../..')

// 按相对路径读取仓库文件内容，便于对预览工具骨架做静态断言。
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('year-report preview tool exposes a dedicated local preview entry', () => {
  const packageJson = JSON.parse(read('package.json'))
  const html = read('tools/year-report-preview/index.html')
  const server = read('tools/year-report-preview/server.js')
  const readme = read('tools/year-report-preview/README.md')

  assert.match(packageJson.scripts['preview:year-report'], /tools\/year-report-preview\/server\.js/)
  assert.match(html, /data-role="report-app"/)
  assert.match(html, /data-role="report-stage"/)
  assert.match(html, /data-role="progress"/)
  assert.match(html, /data-role="prev-hit"/)
  assert.match(html, /data-role="next-hit"/)
  assert.match(server, /text\/event-stream/)
  assert.match(server, /fs\.watch/)
  assert.match(readme, /preview:year-report/)
})

test('year-report preview styles expose A-style tokens and four page templates', () => {
  const css = read('tools/year-report-preview/styles.css')

  assert.match(css, /--report-bg: #0B0D1D;/i)
  assert.match(css, /--report-surface: #0F1225;/i)
  assert.match(css, /--report-primary: #4338CA;/i)
  assert.match(css, /--report-primary-2: #6366F1;/i)
  assert.match(css, /--report-accent: #22C55E;/i)
  assert.match(css, /--report-text: #F8FAFC;/i)
  assert.match(css, /\.page--t1/)
  assert.match(css, /\.page--t2/)
  assert.match(css, /\.page--t3/)
  assert.match(css, /\.page--t4/)
  assert.match(css, /scroll-snap-align: start;/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('year-report preview registers the confirmed P/L order and template mapping', () => {
  const js = read('tools/year-report-preview/preview.js')

  assert.match(js, /pageId: 'P01', template: 'T1'/)
  assert.match(js, /pageId: 'P08', template: 'T2'/)
  assert.match(js, /pageId: 'P18', template: 'T3'/)
  assert.match(js, /pageId: 'P32', template: 'T4'/)
  assert.match(js, /pageId: 'L04', template: 'T2'/)
  assert.match(js, /const PAGE_SEQUENCE = \[/)
  assert.match(js, /'P01'/)
  assert.match(js, /'P32'/)
  assert.match(js, /'L04'/)
  assert.match(js, /renderPage\(/)
})

test('year-report preview supports wheel click keyboard and touch paging interactions', () => {
  const js = read('tools/year-report-preview/preview.js')
  const css = read('tools/year-report-preview/styles.css')

  assert.match(js, /addEventListener\('wheel'/)
  assert.match(js, /addEventListener\('keydown'/)
  assert.match(js, /prevHit\.addEventListener\('click'/)
  assert.match(js, /nextHit\.addEventListener\('click'/)
  assert.match(js, /addEventListener\('touchstart'/)
  assert.match(js, /addEventListener\('touchmove'/)
  assert.match(js, /addEventListener\('touchend'/)
  assert.match(js, /DRAG_THRESHOLD/)
  assert.match(js, /prefers-reduced-motion/)
  assert.match(css, /\.report-hit--prev/)
  assert.match(css, /\.report-hit--next/)
  assert.match(css, /\.page\.is-active/)
})

test('year-report preview includes rich mock data and page-specific render markers for p01 p12 p24 p32', () => {
  const js = read('tools/year-report-preview/preview.js')
  const mock = JSON.parse(read('tools/year-report-preview/data/mock-report.json'))

  const pageIds = mock.pages.map(page => page.page_id)
  assert.deepEqual(pageIds, ['P01', 'P12', 'P24', 'P32'])
  assert.match(js, /data-page-kind="hero-start"/)
  assert.match(js, /data-page-kind="season-card"/)
  assert.match(js, /data-page-kind="album-ranking"/)
  assert.match(js, /data-page-kind="summary-grid"/)
})

test('year-report preview renders rich structures for p01 p12 p24 p32', () => {
  const js = read('tools/year-report-preview/preview.js')
  const css = read('tools/year-report-preview/styles.css')

  assert.match(js, /class="hero-start__value"/)
  assert.match(js, /class="season-card__cover"/)
  assert.match(js, /class="album-ranking__champion"/)
  assert.match(js, /class="summary-grid__card"/)
  assert.match(css, /\.hero-start__value/)
  assert.match(css, /\.season-card__cover/)
  assert.match(css, /\.album-ranking__champion/)
  assert.match(css, /\.summary-grid__card/)
})
