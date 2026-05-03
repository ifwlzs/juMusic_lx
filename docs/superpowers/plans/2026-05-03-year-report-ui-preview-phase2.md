# Year Report UI Preview Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把年度报告预览工具从“骨架占位页”推进到“第一批真实效果页”，优先完成 `P01`、`P12`、`P24`、`P32` 四个代表页面的视觉与结构落地。

**Architecture:** 继续沿用 `tools/year-report-preview/` 静态预览工具，不改动翻页状态机主结构。通过增强 `mock-report.json`、扩展 `preview.js` 的模板渲染逻辑、补充 `styles.css` 的卡片/主视觉/榜单/四格样式，把四类模板首次真正落地为可看的页面效果，同时保持其它页面继续使用 fallback 占位。

**Tech Stack:** Node.js、本地静态预览工具（HTML/CSS/JavaScript）、node:test

---

## 一、文件职责与改动范围

### 预计修改文件

- `tools/year-report-preview/data/mock-report.json`
  - 补充 `P01 / P12 / P24 / P32` 的真实样例数据

- `tools/year-report-preview/preview.js`
  - 增加四个目标页的定制渲染函数
  - 保持其它页面继续 fallback 渲染

- `tools/year-report-preview/styles.css`
  - 增加主视觉卡片、季节页、榜单页、四格页的样式

- `tests/year-report/year-report-preview-tool.test.js`
  - 增加四个目标页的结构断言

---

## 二、任务分解

### Task 1: 补四个代表页的数据样例与渲染契约测试

**Files:**
- Modify: `tools/year-report-preview/data/mock-report.json`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，锁定四个目标页的结构契约**

```js
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
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，提示 mock 数据或渲染标记缺失。

- [ ] **Step 3: 扩充 `mock-report.json` 只保留四个目标页的高质量样例数据**

```json
{
  "year": 2025,
  "pages": [
    {
      "page_id": "P01",
      "title": "首次使用",
      "year": 2025,
      "summary_text": "从第一次点开，到现在已经一起听了很久。",
      "hero_value": "1324 天",
      "hero_label": "已经陪你听歌这么久",
      "first_played_at": "2022-09-18 22:14",
      "supporting_facts": ["第 1 首：夜航星", "第 1 位常听歌手：不才"]
    },
    {
      "page_id": "P12",
      "title": "春季最爱",
      "year": 2025,
      "summary_text": "春天那段时间，你反复回到这首歌里。",
      "season_name": "SPRING",
      "track_title": "若月亮没来",
      "artist_display": "王宇宙Leto",
      "play_total": 37,
      "active_days": 18,
      "accent_hex": "#34D399"
    },
    {
      "page_id": "P24",
      "title": "年度最爱专辑榜",
      "year": 2025,
      "summary_text": "这些专辑，几乎构成了你这一年的背景音。",
      "album_ranking": [
        {"rank": 1, "album_display": "微光", "artist_display": "不才", "play_total": 64},
        {"rank": 2, "album_display": "失眠宇宙", "artist_display": "王宇宙Leto", "play_total": 51},
        {"rank": 3, "album_display": "群青日和", "artist_display": "ヨルシカ", "play_total": 43}
      ]
    },
    {
      "page_id": "P32",
      "title": "音乐四格总结",
      "year": 2025,
      "summary_text": "这一年最重要的四个听歌结论，停在这里。",
      "summary_cards": [
        {"card_id": "song", "headline": "年度歌曲", "value": "若月亮没来", "support_text": "反复陪你到很晚"},
        {"card_id": "artist", "headline": "年度歌手", "value": "不才", "support_text": "安静地占了很多夜晚"},
        {"card_id": "album", "headline": "年度专辑", "value": "微光", "support_text": "你最常回到这里"},
        {"card_id": "night", "headline": "最晚听歌", "value": "03:08", "support_text": "那晚你还没睡"}
      ]
    }
  ]
}
```

- [ ] **Step 4: 在 `preview.js` 中补最小 page-kind 标记占位**

```js
function renderPage(page, index, total) {
  if (page.page_id === 'P01') return `<section data-page-kind="hero-start"></section>`
  if (page.page_id === 'P12') return `<section data-page-kind="season-card"></section>`
  if (page.page_id === 'P24') return `<section data-page-kind="album-ranking"></section>`
  if (page.page_id === 'P32') return `<section data-page-kind="summary-grid"></section>`
  return `...原 fallback ...`
}
```

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/data/mock-report.json tools/year-report-preview/preview.js tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): add rich mock data for preview phase 2"
```

---

### Task 2: 实现四个目标页的真实 HTML 结构与 A 风格样式

**Files:**
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/styles.css`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，钉死关键结构类名**

```js
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
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL

- [ ] **Step 3: 在 `preview.js` 中拆出四个渲染函数**

```js
function renderP01(page, index, total) { ... }
function renderP12(page, index, total) { ... }
function renderP24(page, index, total) { ... }
function renderP32(page, index, total) { ... }
```

要求：
- `P01`：大数字 + 首次时间 + 2 条 supporting facts
- `P12`：季节标题 + 中央封面卡 + 歌曲名/歌手 + 2 个辅助指标
- `P24`：冠军卡 + 其余 2~3 名榜单
- `P32`：2x2 四格卡片

- [ ] **Step 4: 在 `styles.css` 中补真实视觉样式**

要求：
- `P01`：大号数字、柔和发光、弱轨道线
- `P12`：春季绿色偏移、玻璃卡片感
- `P24`：冠军卡放大、列表行分层
- `P32`：四格卡统一节奏、可在移动端自动单列

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): render first four rich preview pages"
```

---

### Task 3: 回归验证与本地人工预览

**Files:**
- Modify: `tools/year-report-preview/README.md`（如需要补充说明）

- [ ] **Step 1: 跑测试全量回归**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 2: 本地启动预览工具**

Run: `npm run preview:year-report`
Expected: 输出 `Year report preview: http://127.0.0.1:4867`

- [ ] **Step 3: 人工检查**

```text
1. P01 不是纯文本占位，而是开场主视觉页。
2. P12 明显是四季页风格之一，且有春季色。
3. P24 有冠军卡和榜单层级。
4. P32 是 2x2 总结四格。
5. 翻页交互未回归。
```

- [ ] **Step 4: 提交最终微调**

```bash
git add tools/year-report-preview/README.md tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): complete preview phase 2 first rich pages"
```

---

## 三、Spec 覆盖自检

本计划覆盖：
- A 风格继续深化；
- 一页一个模块；
- 四模板中的代表页首次真实落地；
- P12 四季同构中的春季页样式基线；
- 桌面 / 移动翻页交互保持不变。

本计划暂不覆盖：
- 全 36 页全部精修；
- React Native App 内嵌；
- 分享图；
- 全量真实数据页面映射。
