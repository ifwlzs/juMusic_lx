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
