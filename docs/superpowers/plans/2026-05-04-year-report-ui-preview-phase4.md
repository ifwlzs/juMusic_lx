# Year Report UI Preview Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `P` 顺序继续补齐年度报告预览工具的 `P06 ~ P11` 六个连续页面，让前半段从开场、统计页一路延伸到关键词、城市陪伴、曲风榜、曲风进化、品味分数和封面主色的连续可看效果。

**Architecture:** 继续沿用 `tools/year-report-preview/` 的静态预览架构，不改分页交互和现有 `P01 ~ P05 / P12 / P24 / P32` 的页面实现。通过扩展 `mock-report.json`、补 `preview.js` 的 6 个新渲染函数、在 `styles.css` 中继续沿用 A 风格沉浸式组件并提取可复用块，让前 11 页形成完整的前半段浏览链路。

**Tech Stack:** Node.js、静态 HTML/CSS/JavaScript、node:test

---

## 一、文件职责与改动范围

### 预计修改文件

- `tools/year-report-preview/data/mock-report.json`
  - 增加 `P06 ~ P11` 的样例数据，保留已存在页面不回退

- `tools/year-report-preview/preview.js`
  - 增加 `P06 ~ P11` 的页面渲染函数与 `page-kind` 映射

- `tools/year-report-preview/styles.css`
  - 增加关键词云页、城市故事页、曲风榜页、曲风进化页、品味分数页、封面主色页样式

- `tests/year-report/year-report-preview-tool.test.js`
  - 先补失败测试，再验证 mock 数据、page-kind 与关键结构类名

- `CHANGELOG.md`
  - 记录 Phase 4 的连续补页

---

## 二、任务分解

### Task 1: 扩展 P06 ~ P11 mock 数据与渲染标记契约

**Files:**
- Modify: `tools/year-report-preview/data/mock-report.json`
- Modify: `tests/year-report/year-report-preview-tool.test.js`
- Modify: `tools/year-report-preview/preview.js`

- [ ] **Step 1: 先写失败测试，锁定新增页的 mock 数据范围与 page-kind 标记**

```js
test('year-report preview includes rich mock data and page-specific render markers for p06 p07 p08 p09 p10 p11', () => {
  const js = read('tools/year-report-preview/preview.js')
  const mock = JSON.parse(read('tools/year-report-preview/data/mock-report.json'))

  const pageIds = mock.pages.map(page => page.page_id)
  assert.deepEqual(pageIds, ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P24', 'P32'])
  assert.match(js, /data-page-kind="keyword-cloud"/)
  assert.match(js, /data-page-kind="city-story"/)
  assert.match(js, /data-page-kind="genre-ranking"/)
  assert.match(js, /data-page-kind="genre-evolution"/)
  assert.match(js, /data-page-kind="taste-score"/)
  assert.match(js, /data-page-kind="cover-color"/)
})
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL，因为 mock 数据与 `page-kind` 尚未补齐。

- [ ] **Step 3: 扩展 `mock-report.json`，补 `P06 ~ P11` 的样例数据**

```json
{
  "page_id": "P06",
  "title": "年度关键词",
  "year": 2025,
  "summary_text": "如果要用几个词来概括你今年的听歌气味，大概就是这些。",
  "keyword_cloud": [
    { "label": "深夜", "weight": "xl", "accent": "primary" },
    { "label": "通勤", "weight": "md", "accent": "highlight" },
    { "label": "循环", "weight": "lg", "accent": "accent" },
    { "label": "治愈", "weight": "md", "accent": "primary" },
    { "label": "雨天", "weight": "sm", "accent": "muted" }
  ],
  "keyword_caption": "深夜和循环，几乎构成了这一年的底色。"
}
```

```json
{
  "page_id": "P07",
  "title": "城市陪伴",
  "year": 2025,
  "summary_text": "有些歌像是陪你穿过很多条熟悉街道。",
  "city_story": {
    "headline": "这一年，音乐最常陪你走在回家路上",
    "support_text": "晚高峰之后，你会重新点开那些熟悉的歌。"
  },
  "city_facts": [
    "通勤时段最常听歌：19:00 - 21:00",
    "夜路代表曲：若月亮没来",
    "最常出现的场景：回家、下雨、走路"
  ]
}
```

```json
{
  "page_id": "P08",
  "title": "年度曲风 Top5",
  "year": 2025,
  "summary_text": "这些曲风最能代表你这一年的听感偏好。",
  "genre_ranking": [
    { "rank": 1, "genre_name": "J-Pop", "play_total": 684, "share_text": "29%" },
    { "rank": 2, "genre_name": "国语流行", "play_total": 512, "share_text": "22%" },
    { "rank": 3, "genre_name": "动漫音乐", "play_total": 401, "share_text": "17%" },
    { "rank": 4, "genre_name": "独立流行", "play_total": 296, "share_text": "13%" },
    { "rank": 5, "genre_name": "轻电子", "play_total": 188, "share_text": "8%" }
  ]
}
```

```json
{
  "page_id": "P09",
  "title": "曲风进化历",
  "year": 2025,
  "summary_text": "你的耳朵在一年里，不断朝不同方向偏移。",
  "genre_timeline": [
    { "month": "01", "genre_name": "国语流行", "value": "稳定循环" },
    { "month": "04", "genre_name": "J-Pop", "value": "开始上升" },
    { "month": "08", "genre_name": "动漫音乐", "value": "暑期高峰" },
    { "month": "11", "genre_name": "轻电子", "value": "深夜抬头" }
  ],
  "genre_shift_summary": "春天以后，J-Pop 明显抬头，到了秋冬又开始往更轻的电子质感偏移。"
}
```

```json
{
  "page_id": "P10",
  "title": "品味曲风分数",
  "year": 2025,
  "summary_text": "如果把今年的曲风气质压成一个分数，它大概会是这样。",
  "taste_score": {
    "value": "87",
    "label": "克制、夜感、流动性强"
  },
  "taste_dimensions": [
    { "label": "夜感", "value": "92" },
    { "label": "旋律性", "value": "88" },
    { "label": "探索欲", "value": "74" }
  ]
}
```

```json
{
  "page_id": "P11",
  "title": "年度封面主色",
  "year": 2025,
  "summary_text": "你这一年的封面颜色，也慢慢长成了自己的审美轨迹。",
  "cover_palette": [
    { "hex": "#4F46E5", "label": "午夜蓝紫", "track_title": "若月亮没来" },
    { "hex": "#22C55E", "label": "雾感绿色", "track_title": "夜航星" },
    { "hex": "#F59E0B", "label": "琥珀暖橙", "track_title": "海底" }
  ],
  "palette_note": "偏冷色仍然占主导，但暖色在下半年开始出现得更多。"
}
```

- [ ] **Step 4: 在 `preview.js` 中补最小 page-kind 分派占位**

```js
if (page.page_id === 'P06') return `<section data-page-kind="keyword-cloud"></section>`
if (page.page_id === 'P07') return `<section data-page-kind="city-story"></section>`
if (page.page_id === 'P08') return `<section data-page-kind="genre-ranking"></section>`
if (page.page_id === 'P09') return `<section data-page-kind="genre-evolution"></section>`
if (page.page_id === 'P10') return `<section data-page-kind="taste-score"></section>`
if (page.page_id === 'P11') return `<section data-page-kind="cover-color"></section>`
```

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/data/mock-report.json tools/year-report-preview/preview.js tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): add p06-p11 preview mock pages"
```

---

### Task 2: 实现 P06 / P07 / P08 的真实结构与样式

**Files:**
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/styles.css`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，钉死 `P06 / P07 / P08` 的关键结构类名**

```js
test('year-report preview renders rich structures for p06 p07 p08', () => {
  const js = read('tools/year-report-preview/preview.js')
  const css = read('tools/year-report-preview/styles.css')

  assert.match(js, /class="keyword-cloud__token"/)
  assert.match(js, /class="city-story__headline"/)
  assert.match(js, /class="genre-ranking__champion"/)
  assert.match(css, /\.keyword-cloud__token/)
  assert.match(css, /\.city-story__headline/)
  assert.match(css, /\.genre-ranking__champion/)
})
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL

- [ ] **Step 3: 在 `preview.js` 中补 `renderP06 / renderP07 / renderP08`**

要求：
- `P06`：关键词云为主角，底部一句收束文案
- `P07`：故事 headline + 3 条事实，偏情绪页
- `P08`：Top1 曲风冠军卡 + Top2~Top5 列表

- [ ] **Step 4: 在 `styles.css` 中补 `P06 / P07 / P08` 样式**

要求：
- `P06`：词云大小有节奏，避免花里胡哨漂浮动画
- `P07`：主 headline 居中偏海报化，事实卡弱化
- `P08`：冠军卡明显放大，与 `P24` 榜单风格同家族但不重复

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): render p06-p08 preview pages"
```

---

### Task 3: 实现 P09 / P10 / P11 的真实结构与样式

**Files:**
- Modify: `tools/year-report-preview/preview.js`
- Modify: `tools/year-report-preview/styles.css`
- Modify: `tests/year-report/year-report-preview-tool.test.js`

- [ ] **Step 1: 先写失败测试，钉死 `P09 / P10 / P11` 的关键结构类名**

```js
test('year-report preview renders rich structures for p09 p10 p11', () => {
  const js = read('tools/year-report-preview/preview.js')
  const css = read('tools/year-report-preview/styles.css')

  assert.match(js, /class="genre-evolution__item"/)
  assert.match(js, /class="taste-score__value"/)
  assert.match(js, /class="cover-color__swatch"/)
  assert.match(css, /\.genre-evolution__item/)
  assert.match(css, /\.taste-score__value/)
  assert.match(css, /\.cover-color__swatch/)
})
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: FAIL

- [ ] **Step 3: 在 `preview.js` 中补 `renderP09 / renderP10 / renderP11`**

要求：
- `P09`：时间线 / 进化列表 + 一段解释文案
- `P10`：大分数英雄区 + 3 维度辅助条
- `P11`：3 个颜色块 + 代表歌曲 + 总结说明

- [ ] **Step 4: 在 `styles.css` 中补 `P09 / P10 / P11` 样式**

要求：
- `P09`：月度节点有节奏线性串联，像“进化历”而不是表格
- `P10`：分数页必须有明显主视觉停顿感
- `P11`：颜色卡主导页面，但不要把“主色页”做成杂乱色板

- [ ] **Step 5: 再跑测试确认通过**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add tools/year-report-preview/preview.js tools/year-report-preview/styles.css tests/year-report/year-report-preview-tool.test.js
git commit -m "feat(year-report): render p09-p11 preview pages"
```

---

### Task 4: 回归验证、预览检查与文档收口

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `tools/year-report-preview/README.md`（如需要）

- [ ] **Step 1: 更新 `CHANGELOG.md`**

在 `Unreleased` 中补一条：

```md
- 年度报告预览工具继续补齐 `P06 ~ P11` 前半段页面，新增年度关键词、城市陪伴、曲风榜、曲风进化、品味分数与封面主色的真实效果页
```

- [ ] **Step 2: 跑预览测试回归**

Run: `node --test tests/year-report/year-report-preview-tool.test.js`
Expected: PASS

- [ ] **Step 3: 启动预览服务并做人工检查**

Run: `npm run preview:year-report`
Expected: 输出 `Year report preview: http://127.0.0.1:4867`

人工检查：

```text
1. P01 ~ P11 已形成连续前半段体验。
2. P06 关键词页、P07 情绪故事页、P08 曲风榜三页节奏明显不同。
3. P09 / P10 / P11 与前面统计页风格同家族，但不会看起来完全重复。
4. 桌面端左右点击 / 滚轮切页不回归。
5. 移动端单列布局不溢出，P12 / P24 / P32 的既有效果不被破坏。
```

- [ ] **Step 4: 提交文档 / 回归收口**

```bash
git add CHANGELOG.md tools/year-report-preview/README.md tests/year-report/year-report-preview-tool.test.js tools/year-report-preview/preview.js tools/year-report-preview/styles.css tools/year-report-preview/data/mock-report.json
git commit -m "feat(year-report): complete preview phase 4 front-half pages"
```

---

## 三、Spec 覆盖自检

本计划覆盖：
- 按 `P` 顺序继续推进到 `P11`；
- `T1 / T2 / T3` 模板继续深化；
- `P06 ~ P11` 与已完成 `P01 ~ P05` 连成前半段完整浏览链；
- A 风格、桌面滚轮切页、移动上下滑半跟手保持不变。

本计划暂不覆盖：
- `P13 ~ P15` 四季页完整补齐；
- `P16 ~ P23` 中段页面；
- `P25 ~ P31` 收尾前的余页；
- App 内嵌、分享图与全量真实数据映射。
