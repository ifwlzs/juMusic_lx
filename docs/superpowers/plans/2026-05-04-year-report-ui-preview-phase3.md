# Year Report UI Preview Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `P` 顺序把年度报告预览工具继续推进到 `P02 ~ P05` 四个连续统计页，先交付可看的真实效果页，而不是空占位页。

**Architecture:** 继续沿用 `tools/year-report-preview/` 静态预览工具，不改翻页状态机与全局分页骨架。通过扩展 `mock-report.json`、在 `preview.js` 增加 `P02 ~ P05` 的定制渲染函数，并在 `styles.css` 中补充一组可复用的统计页、对照页、语言页和关键词页样式，让前五页形成连续的浏览体验。

**Tech Stack:** Node.js、静态 HTML/CSS/JavaScript、node:test

---

## 一、文件职责与改动范围

### 预计修改文件

- `tools/year-report-preview/data/mock-report.json`
  - 增加 `P02 ~ P05` 的高质量样例数据，保持 `P01 / P12 / P24 / P32` 不回退

- `tools/year-report-preview/preview.js`
  - 增加 `P02 ~ P05` 的页面渲染函数
  - 保持 `P01 / P12 / P24 / P32` 现有效果不变

- `tools/year-report-preview/styles.css`
  - 补充统计总览页、探索广度页、外语歌曲页、对照页样式
  - 尽量抽公共块，避免每页完全独立造轮子

- `tests/year-report/year-report-preview-tool.test.js`
  - 先补失败测试，再校验新页 rich markers 与关键 class 结构

- `CHANGELOG.md`
  - 记录预览 Phase 3 连续页补完

---

## 二、任务分解

### Task 1: 扩展 P02 ~ P05 mock 数据与渲染契约测试

**Files:**
- Modify: `tools/year-report-preview/data/mock-report.json`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，锁定新增页的 mock 数据与 page-kind 标记**

```js
test('year-report preview includes rich mock data and page-specific render markers for p02 p03 p04 p05', () => {
  const js = read('tools/year-report-preview/preview.js')
  const mock = JSON.parse(read('tools/year-report-preview/data/mock-report.json'))

  const pageIds = mock.pages.map(page => page.page_id)
  assert.deepEqual(pageIds, ['P01', 'P02', 'P03', 'P04', 'P05', 'P12', 'P24', 'P32'])
  assert.match(js, /data-page-kind="year-overview"/)
  assert.match(js, /data-page-kind="explore-width"/)
  assert.match(js, /data-page-kind="language-spotlight"/)
  assert.match(js, /data-page-kind="taste-balance"/)
})
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，提示 mock 页缺失或新增 page-kind 未出现。

- [ ] **Step 3: 扩展 `mock-report.json`，补 `P02 ~ P05` 的样例数据**

```json
{
  "page_id": "P02",
  "title": "年度总览",
  "year": 2025,
  "summary_text": "这一年，你把很多夜晚都留给了音乐。",
  "overview_stats": [
    { "stat_id": "plays", "label": "播放次数", "value": "5,284", "emphasis": "primary" },
    { "stat_id": "hours", "label": "听歌时长", "value": "412h", "emphasis": "secondary" },
    { "stat_id": "tracks", "label": "听过歌曲", "value": "1,268", "emphasis": "secondary" },
    { "stat_id": "artists", "label": "听过歌手", "value": "286", "emphasis": "secondary" }
  ],
  "hero_fact": { "label": "最常听歌时段", "value": "23:00 - 01:00" }
}
```

```json
{
  "page_id": "P03",
  "title": "年度探索广度",
  "year": 2025,
  "summary_text": "你不只是重复喜欢，也在一直扩展自己的听感。",
  "breadth_metrics": [
    { "metric_id": "new_artist", "label": "新遇见歌手", "value": "94" },
    { "metric_id": "new_album", "label": "新遇见专辑", "value": "61" },
    { "metric_id": "new_language", "label": "新语种", "value": "6" }
  ],
  "explore_story": ["3 月探索欲最强", "夏天新歌加入最多", "秋天开始补老专辑"]
}
```

```json
{
  "page_id": "P04",
  "title": "外语歌曲",
  "year": 2025,
  "summary_text": "今年你最常切到的，是这些不同语言的声音。",
  "language_cards": [
    { "language": "日语", "play_total": 612, "share_text": "48%", "track_title": "群青日和", "artist_display": "ヨルシカ" },
    { "language": "英语", "play_total": 284, "share_text": "22%", "track_title": "Golden Hour", "artist_display": "JVKE" },
    { "language": "韩语", "play_total": 133, "share_text": "10%", "track_title": "Ditto", "artist_display": "NewJeans" }
  ]
}
```

```json
{
  "page_id": "P05",
  "title": "主动探索 vs 重复所爱",
  "year": 2025,
  "summary_text": "一边在扩列，一边也在把喜欢反复听到更深。",
  "balance_compare": {
    "explore": { "label": "主动探索", "value": "42%", "support_text": "新歌、新专辑、新歌手" },
    "repeat": { "label": "重复所爱", "value": "58%", "support_text": "熟悉的歌一遍遍陪你" }
  },
  "balance_caption": "你还是更偏爱那些已经住进生活里的歌。"
}
```

- [ ] **Step 4: 在 `preview.js` 中补最小 page-kind 分派占位**

```js
if (page.page_id === 'P02') return `<section data-page-kind="year-overview"></section>`
if (page.page_id === 'P03') return `<section data-page-kind="explore-width"></section>`
if (page.page_id === 'P04') return `<section data-page-kind="language-spotlight"></section>`
if (page.page_id === 'P05') return `<section data-page-kind="taste-balance"></section>`
```

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/data/mock-report.json tools/year-report-preview/preview.js tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): add p02-p05 preview mock pages"
```

---

### Task 2: 实现 P02 ~ P05 的真实结构与 A 风格页面样式

**Files:**
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/styles.css`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，钉死新增页的关键结构类名**

```js
test('year-report preview renders rich structures for p02 p03 p04 p05', () => {
  const js = read('tools/year-report-preview/preview.js')
  const css = read('tools/year-report-preview/styles.css')

  assert.match(js, /class="year-overview__hero-value"/)
  assert.match(js, /class="explore-width__metric"/)
  assert.match(js, /class="language-spotlight__card"/)
  assert.match(js, /class="taste-balance__split"/)
  assert.match(css, /\.year-overview__hero-value/)
  assert.match(css, /\.explore-width__metric/)
  assert.match(css, /\.language-spotlight__card/)
  assert.match(css, /\.taste-balance__split/)
})
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL

- [ ] **Step 3: 在 `preview.js` 中补四个渲染函数**

```js
function renderP02(page, index, total) { ... }
function renderP03(page, index, total) { ... }
function renderP04(page, index, total) { ... }
function renderP05(page, index, total) { ... }
```

要求：
- `P02`：总览英雄数字 + 4 卡片 + 1 条重点事实
- `P03`：3 张探索指标卡 + 1 列探索轨迹文案
- `P04`：3 张语言卡，强调语言占比与代表歌曲
- `P05`：左右对照分栏 + 中部比例焦点 + 一句收束文案

- [ ] **Step 4: 在 `styles.css` 中补真实样式**

要求：
- `P02`：大数字 + 玻璃统计卡 + 强总览感
- `P03`：模块网格 + 探索轨迹时间感
- `P04`：多语言卡片分层，适合移动端单列
- `P05`：左右对照强烈，但不做土味大饼图
- 保持 A 风格：深夜底、蓝紫主调、少量绿色点缀、青年感

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): render p02-p05 preview pages"
```

---

### Task 3: 回归验证、预览检查与文档收口

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `tools/year-report-preview/README.md`（如需要）

- [ ] **Step 1: 更新 `CHANGELOG.md`**

在 `Unreleased` 的“新增”或“优化”段落中补一条：

```md
- 年度报告预览工具继续补齐 `P02 ~ P05` 连续统计页，新增年度总览、探索广度、外语歌曲与主动探索 / 重复所爱四个真实效果页
```

- [ ] **Step 2: 跑预览测试回归**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 3: 启动预览服务并做人工检查**

Run: `npm run preview:year-report`
Expected: 输出 `Year report preview: http://127.0.0.1:4867`

人工检查：

```text
1. P01~P05 现在连续可看，不再从第一页直接跳到空白骨架感。
2. P02 是总览页，P03 是探索页，P04 是外语页，P05 是对照页。
3. 桌面端左右点击切页与滚轮切页没回归。
4. 移动端单列布局不溢出。
5. P12 / P24 / P32 的既有效果没有被破坏。
```

- [ ] **Step 4: 提交文档 / 回归收口**

```bash
git add CHANGELOG.md tools/year-report-preview/README.md tests/year-report/year-report-preview-tool.test.js tools/year-report-preview/preview.js tools/year-report-preview/styles.css
git commit -m "feat(year-report): complete preview phase 3 sequential pages"
```

---

## 三、Spec 覆盖自检

本计划覆盖：
- 按 `P` 顺序推进连续前置页；
- 继续沿用 `T3` 统计 / 对照页体系；
- 预览仍然优先“先出效果”；
- 桌面与移动翻页交互保持不变；
- A 风格统一延续到 `P01 ~ P05` 连续体验。

本计划暂不覆盖：
- `P06 ~ P11` 剩余前半段页面；
- 四季页完整补齐 `P13 ~ P15`；
- `P21 ~ P31` 大规模补页；
- App 内嵌、分享图、全量真实数据映射。
