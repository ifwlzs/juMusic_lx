# Year Report UI Preview Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把年度报告 A 风格做成一个可打开、可翻页、可接入真实 JSON 的本地浏览器预览工具，优先交付“先出效果”的可视化结果。

**Architecture:** 采用仓库现有 `tools/play-detail-bg-preview` 的工具模式，新建 `tools/year-report-preview/` 静态预览工具。预览工具用 `index.html + styles.css + preview.js` 实现全屏分页、四模板系统与桌面 / 移动端翻页交互；数据层先支持“页面定义 fallback + fetch 真实年报 JSON”的双通道，保证当前已落地的 `build_year_report.py` 输出可以直接接入，同时没有真实数据的页面也能先展示 UI 效果。

**Tech Stack:** Node.js 本地静态预览服务器、原生 HTML/CSS/JavaScript、Python 年报构建脚本 `scripts/year_report/build_year_report.py`、node:test、pytest

---

## 一、范围切分说明

当前 UI / UX 规格覆盖了：

1. 全套视觉系统；
2. 全套分页交互；
3. `P01 ~ P32` 与 `L01 ~ L04` 页面顺序；
4. 真实数据接入；
5. 后续可能的 App 内嵌。

这已经超过单次“先出效果”实现的合理范围，因此本计划只做 **Phase 1：浏览器预览工具**，交付以下能力：

- A 风格视觉基线；
- 一页一个模块；
- T1 / T2 / T3 / T4 四模板；
- 桌面滚轮 / 点击切页；
- 移动端上下滑半跟手切页；
- 所有 `P / L` 页顺序注册；
- 真实 `report.json` 接入能力；
- 当前没有真实数据的页面允许用 fallback 占位渲染。

**不在本计划内：**

- React Native App 内嵌屏幕；
- 分享导出图片；
- 全量页面真实统计落地；
- 最终上线级动画打磨。

---

## 二、文件职责与改动范围

### 预计新增文件

- `tools/year-report-preview/index.html`
  - 预览工具页面骨架
  - 顶层 stage 容器、分页进度、热区与辅助提示

- `tools/year-report-preview/styles.css`
  - A 风格设计 token
  - 四模板布局样式
  - 桌面 / 移动端响应式规则
  - reduced-motion 兜底

- `tools/year-report-preview/preview.js`
  - 页面定义注册
  - fallback 数据合并
  - 翻页状态机
  - 桌面滚轮 / 点击 / 键盘
  - 移动端半跟手手势
  - JSON fetch 与渲染

- `tools/year-report-preview/server.js`
  - 本地静态服务器
  - SSE 热刷新

- `tools/year-report-preview/README.md`
  - 启动方式
  - 数据文件说明
  - 交互说明

- `tools/year-report-preview/data/mock-report.json`
  - 用于 UI 效果预览的最小样例数据

- `tests/year-report/year-report-preview-tool.test.js`
  - 预览工具结构与交互契约测试

### 预计修改文件

- `package.json`
  - 增加 `preview:year-report` 与 `test:year-report-preview`

- `scripts/year_report/build_year_report.py`
  - 增加 CLI 导出能力
  - 支持把 Python 年报结构写成预览工具可直接读取的 JSON 文件

- `tests/python/test_year_report_build.py`
  - 补充 CLI 导出测试

---

## 三、任务分解

### Task 1: 搭建年度报告预览工具骨架

**Files:**
- Create: `tools/year-report-preview/index.html`
- Create: `tools/year-report-preview/server.js`
- Create: `tools/year-report-preview/README.md`
- Create: `tests/year-report/year-report-preview-tool.test.js`
- Modify: `package.json`

- [ ] **Step 1: 先写失败的工具骨架测试**

在 `tests/year-report/year-report-preview-tool.test.js` 中先写：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
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
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，提示文件不存在或缺少脚本。

- [ ] **Step 3: 新建 `index.html` 最小骨架**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>juMusic Year Report Preview</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="report-app" data-role="report-app">
    <div class="report-stage" data-role="report-stage"></div>
    <div class="report-progress" data-role="progress"></div>
    <button type="button" class="report-hit report-hit--prev" data-role="prev-hit" aria-label="上一页"></button>
    <button type="button" class="report-hit report-hit--next" data-role="next-hit" aria-label="下一页"></button>
  </div>
  <script type="module" src="./preview.js"></script>
</body>
</html>
```

- [ ] **Step 4: 复用现有预览工具模式创建 `server.js`**

```js
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.env.PORT || 4867)
const rootDir = __dirname
const eventClients = new Set()

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

const broadcastReload = () => {
  for (const response of eventClients) response.write('data: reload\n\n')
}

fs.watch(rootDir, { recursive: true }, () => {
  broadcastReload()
})

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0])

  if (requestPath === '/__events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    response.write('\n')
    eventClients.add(response)
    request.on('close', () => eventClients.delete(response))
    return
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  const filePath = path.join(rootDir, relativePath)
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
  })
  response.end(fs.readFileSync(filePath))
})

server.listen(port, () => {
  console.log(`Year report preview: http://127.0.0.1:${port}`)
})
```

- [ ] **Step 5: 在 `package.json` 增加启动 / 测试脚本**

```json
{
  "scripts": {
    "preview:year-report": "node tools/year-report-preview/server.js",
    "test:year-report-preview": "node --test tests/year-report/year-report-preview-tool.test.js"
  }
}
```

- [ ] **Step 6: 写最小 README**

```md
# Year Report Preview Tool

运行：

```bash
npm run preview:year-report
```

然后打开：`http://127.0.0.1:4867`
```

- [ ] **Step 7: 重新运行测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add package.json tools/year-report-preview tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): scaffold preview tool"
```

---

### Task 2: 落地 A 风格设计 token 与四模板布局

**Files:**
- Create: `tools/year-report-preview/styles.css`
- Modify: `tools/year-report-preview/index.html`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先扩测试，钉死设计 token 与模板类名**

在 `tests/year-report/year-report-preview-tool.test.js` 追加：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，提示 `styles.css` 或 token 缺失。

- [ ] **Step 3: 写 `styles.css` 根变量与全屏布局**

```css
:root {
  --report-bg: #0B0D1D;
  --report-surface: #0F1225;
  --report-surface-2: #14172F;
  --report-primary: #4338CA;
  --report-primary-2: #6366F1;
  --report-primary-3: #7C3AED;
  --report-accent: #22C55E;
  --report-highlight: #38BDF8;
  --report-text: #F8FAFC;
  --report-text-soft: #CBD5E1;
  --report-text-muted: #94A3B8;
}

html, body {
  margin: 0;
  min-height: 100%;
  background: var(--report-bg);
  color: var(--report-text);
}

.report-app {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(99, 102, 241, 0.24), transparent 32%),
    linear-gradient(180deg, var(--report-bg), var(--report-surface));
}

.report-stage {
  height: 100vh;
}

.page {
  min-height: 100vh;
  padding: 24px 16px 28px;
  box-sizing: border-box;
}
```

- [ ] **Step 4: 增加四模板样式骨架**

```css
.page--t1 .page__hero {
  display: grid;
  gap: 20px;
  place-items: center;
  text-align: center;
}

.page--t2 .page__ranking {
  display: grid;
  gap: 12px;
}

.page--t3 .page__stats {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.page--t4 .page__summary-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

- [ ] **Step 5: 增加 reduced-motion 与移动端约束**

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}

@media (max-width: 767px) {
  .page {
    padding: 20px 16px 24px;
  }

  .page__summary-grid,
  .page--t3 .page__stats {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: 重新运行测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add tools/year-report-preview/styles.css tools/year-report-preview/index.html tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): add style tokens and page templates"
```

---

### Task 3: 实现页面定义注册与全页顺序渲染

**Files:**
- Create: `tools/year-report-preview/data/mock-report.json`
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写页面顺序与模板映射测试**

在 `tests/year-report/year-report-preview-tool.test.js` 追加：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，提示 `preview.js` 内容不足。

- [ ] **Step 3: 在 `preview.js` 中写全页顺序和模板注册表**

```js
const PAGE_SEQUENCE = [
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
  'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
  'P21', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30',
  'P31', 'P32', 'L01', 'L02', 'L03', 'L04',
]

const PAGE_REGISTRY = [
  { pageId: 'P01', template: 'T1', accent: 'primary' },
  { pageId: 'P02', template: 'T3', accent: 'primary' },
  { pageId: 'P08', template: 'T2', accent: 'primary' },
  { pageId: 'P12', template: 'T1', accent: 'spring' },
  { pageId: 'P13', template: 'T1', accent: 'summer' },
  { pageId: 'P14', template: 'T1', accent: 'autumn' },
  { pageId: 'P15', template: 'T1', accent: 'winter' },
  { pageId: 'P18', template: 'T3', accent: 'primary' },
  { pageId: 'P24', template: 'T2', accent: 'primary' },
  { pageId: 'P32', template: 'T4', accent: 'primary' },
  { pageId: 'L04', template: 'T2', accent: 'accent' },
]
```

- [ ] **Step 4: 创建最小 `mock-report.json`，保证 4 个模板都有样例页**

```json
{
  "year": 2025,
  "pages": [
    {
      "page_id": "P01",
      "title": "首次使用",
      "year": 2025,
      "summary_text": "这是你和 juMusic 的开场页。",
      "hero_value": "1324 天",
      "hero_label": "已经一起听歌这么久"
    },
    {
      "page_id": "P24",
      "title": "年度最爱专辑榜",
      "year": 2025,
      "summary_text": "你最常回到这些专辑里。",
      "album_ranking": []
    },
    {
      "page_id": "P32",
      "title": "音乐四格总结",
      "year": 2025,
      "summary_text": "这一年听歌的轮廓，就停在这里。",
      "summary_cards": []
    }
  ]
}
```

- [ ] **Step 5: 在 `preview.js` 实现 fallback 合并与 `renderPage()`**

```js
function normalizePages(report) {
  const pageMap = new Map((report.pages || []).map(page => [page.page_id, page]))
  return PAGE_SEQUENCE.map(pageId => {
    const definition = PAGE_REGISTRY.find(item => item.pageId === pageId)
    const payload = pageMap.get(pageId) || {
      page_id: pageId,
      title: pageId,
      year: report.year,
      summary_text: '该页真实数据暂未接入，当前展示 UI 占位效果。',
    }
    return {
      ...payload,
      template: definition?.template || 'T3',
      accent: definition?.accent || 'primary',
    }
  })
}

function renderPage(page, index, total) {
  return `
    <section class="page page--${page.template.toLowerCase()}" data-page-id="${page.page_id}">
      <header class="page__top">
        <span class="page__eyebrow">${page.year} · ${page.page_id}</span>
        <span class="page__count">${index + 1} / ${total}</span>
      </header>
      <div class="page__body">
        <h1 class="page__title">${page.title}</h1>
        <p class="page__summary">${page.summary_text || ''}</p>
      </div>
    </section>
  `
}
```

- [ ] **Step 6: 重新运行测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/data/mock-report.json tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): register page sequence and fallback pages"
```

---

### Task 4: 实现桌面滚轮 / 点击切页与移动端半跟手切页

**Files:**
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/styles.css`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写交互契约测试**

在 `tests/year-report/year-report-preview-tool.test.js` 追加：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL

- [ ] **Step 3: 在 `preview.js` 中实现统一的页码状态与切页函数**

```js
let activeIndex = 0
let wheelLocked = false
const DRAG_THRESHOLD = 72

function setActiveIndex(nextIndex) {
  activeIndex = Math.max(0, Math.min(nextIndex, state.pages.length - 1))
  render()
}

function goNext() {
  setActiveIndex(activeIndex + 1)
}

function goPrev() {
  setActiveIndex(activeIndex - 1)
}
```

- [ ] **Step 4: 加桌面端滚轮 / 点击 / 键盘**

```js
stage.addEventListener('wheel', event => {
  event.preventDefault()
  if (wheelLocked) return
  wheelLocked = true
  if (event.deltaY > 0) goNext()
  else if (event.deltaY < 0) goPrev()
  window.setTimeout(() => {
    wheelLocked = false
  }, 280)
}, { passive: false })

prevHit.addEventListener('click', () => { goPrev() })
nextHit.addEventListener('click', () => { goNext() })

window.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') goNext()
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') goPrev()
})
```

- [ ] **Step 5: 加移动端半跟手 touch 状态机**

```js
let touchStartY = 0
let dragOffset = 0

stage.addEventListener('touchstart', event => {
  touchStartY = event.touches[0].clientY
  dragOffset = 0
}, { passive: true })

stage.addEventListener('touchmove', event => {
  dragOffset = event.touches[0].clientY - touchStartY
  stage.style.setProperty('--drag-offset', `${Math.round(dragOffset * 0.35)}px`)
}, { passive: true })

stage.addEventListener('touchend', () => {
  stage.style.setProperty('--drag-offset', '0px')
  if (dragOffset <= -DRAG_THRESHOLD) goNext()
  else if (dragOffset >= DRAG_THRESHOLD) goPrev()
  dragOffset = 0
})
```

- [ ] **Step 6: 在 `styles.css` 加 active 状态与热区样式**

```css
.report-hit {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 18vw;
  border: 0;
  background: transparent;
  opacity: 0;
  cursor: pointer;
}

.report-hit--prev { left: 0; }
.report-hit--next { right: 0; }

.page {
  transform: translate3d(0, var(--drag-offset, 0px), 0);
  transition: transform 260ms ease-out, opacity 260ms ease-out;
}

.page.is-active {
  opacity: 1;
}
```

- [ ] **Step 7: 重新运行测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): add paging interactions"
```

---

### Task 5: 接入 Python 年报 JSON 导出与预览工具真实数据加载

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Modify: `tests/python/test_year_report_build.py`
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/README.md`

- [ ] **Step 1: 先写 Python CLI 导出测试**

在 `tests/python/test_year_report_build.py` 追加：

```python
import json
import subprocess
import sys
from pathlib import Path

def test_build_year_report_cli_writes_output_json(tmp_path):
    output_path = tmp_path / 'report_preview.json'
    input_path = tmp_path / 'input.json'
    input_path.write_text(json.dumps({'year': 2025, 'play_history': [], 'library_tracks': []}), encoding='utf-8')

    completed = subprocess.run(
        [sys.executable, str(MODULE_PATH), '--input-json', str(input_path), '--output', str(output_path)],
        check=True,
        capture_output=True,
        text=True,
    )

    assert output_path.exists()
    payload = json.loads(output_path.read_text(encoding='utf-8'))
    assert payload['year'] == 2025
    assert isinstance(payload['pages'], list)
    assert 'Wrote year report JSON' in completed.stdout
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/python/test_year_report_build.py -k cli_writes_output_json -v`
Expected: FAIL，提示 CLI 参数或输出逻辑不存在。

- [ ] **Step 3: 在 `build_year_report.py` 增加最小 CLI**

```python
import argparse
import json
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='导出年度报告 JSON。')
    parser.add_argument('--input-json', required=True, help='输入的年报原始 JSON 文件路径。')
    parser.add_argument('--output', required=True, help='输出的年报 JSON 文件路径。')
    return parser.parse_args()


def _main() -> int:
    args = _parse_args()
    input_path = Path(args.input_json)
    output_path = Path(args.output)
    report_input = json.loads(input_path.read_text(encoding='utf-8'))
    report = build_year_report(report_input)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote year report JSON to {output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(_main())
```

- [ ] **Step 4: 在 `preview.js` 中优先尝试 fetch 真实数据，失败再回退 mock**

```js
async function loadReport() {
  try {
    const response = await fetch('./data/live-report.json', { cache: 'no-store' })
    if (response.ok) return await response.json()
  } catch {
    // 真实数据缺失时回退到 mock，不在预览工具里抛异常中断。
  }
  const response = await fetch('./data/mock-report.json', { cache: 'no-store' })
  return response.json()
}
```

- [ ] **Step 5: README 加真实数据刷新说明**

```md
如果你已经有 Python 年报输入 JSON，可以先导出预览文件：

```bash
python scripts/year_report/build_year_report.py --input-json tmp/year-report-input.json --output tools/year-report-preview/data/live-report.json
```

预览工具会优先读取 `data/live-report.json`；没有时自动退回 `data/mock-report.json`。
```

- [ ] **Step 6: 跑 Python 测试确认通过**

Run: `python -m pytest tests/python/test_year_report_build.py -k cli_writes_output_json -v`
Expected: PASS

- [ ] **Step 7: 跑前端预览工具测试确认未回归**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_year_report_build.py tools/year-report-preview/preview.js tools/year-report-preview/README.md
git commit -m "feat(year-report): wire preview tool to exported report json"
```

---

### Task 6: 回归检查与交付说明

**Files:**
- Modify: `tools/year-report-preview/README.md`
- Modify: `tests/year-report/year-report-preview-tool.test.js`（如回归修补需要）
- Modify: `tests/python/test_year_report_build.py`（如回归修补需要）

- [ ] **Step 1: 运行年报预览工具测试全量回归**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 2: 运行 Python 年报测试全量回归**

Run: `python -m pytest tests/python/test_year_report_build.py -v`
Expected: PASS

- [ ] **Step 3: 本地启动预览工具做人工检查**

Run: `npm run preview:year-report`
Expected: 控制台输出 `Year report preview: http://127.0.0.1:4867`

- [ ] **Step 4: 人工检查以下交付点**

```text
1. 首页能正常打开，不是空白页。
2. 鼠标滚轮可以前后翻页。
3. 左右热区点击可切页。
4. 键盘方向键可切页。
5. 移动端模拟器或浏览器设备模式下，上下滑可切页。
6. P12~P15 四季页风格同构。
7. P32 四格页有 2x2 栅格结构。
8. live-report.json 存在时优先读取真实数据。
9. live-report.json 不存在时会回退 mock-report.json。
```

- [ ] **Step 5: 提交最终回归修补**

```bash
git add tools/year-report-preview package.json scripts/year_report/build_year_report.py tests/year-report/year-report-preview-tool.test.js tests/python/test_year_report_build.py
git commit -m "feat(year-report): complete preview phase 1"
```

---

## 四、Spec 覆盖自检

本计划已经覆盖的 spec 要点：

- A 风格深夜霓虹基线；
- 一页一个模块；
- T1 / T2 / T3 / T4 四模板；
- 桌面滚轮 / 点击切页；
- 移动端上下滑、半跟手；
- `P01 ~ P32` 与 `L01 ~ L04` 顺序注册；
- reduced-motion 可访问性；
- 当前真实年报 JSON 的接入能力。

本计划刻意不覆盖的 spec 要点：

- React Native App 内嵌；
- 全部页面的真实统计与最终文案；
- 分享图 / 导出图；
- 上线级动画精修。

这些会在 Phase 2 / Phase 3 再单独起 plan，不与本轮“先出效果”目标混在一起。

---

## 五、Placeholder 自检

已检查：

1. 无 `TODO` / `TBD` / “后续补” 类占位；
2. 每个任务都有明确文件路径；
3. 每个代码步骤都给了最小代码形态；
4. 测试命令与预期结果已写明；
5. 计划与当前代码现状一致：先做浏览器预览工具，再接 Python 输出。
