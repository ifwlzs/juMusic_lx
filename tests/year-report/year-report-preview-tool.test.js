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
