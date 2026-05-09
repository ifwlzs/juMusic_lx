# 年报页面口径修正与剩余页面推进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 P08/P09 中文曲风、P11 封面颜色占比闭合、L04 歌手拆分问题，并继续接入 P24/L02/L03/P32 页面。

**Architecture:** 先在 Python contract 层修正真实聚合口径和可展示字段，再让 Vue 页面优先消费这些稳定字段；前端与 Python 测试同步补齐，确保展示逻辑和数据契约一起锁定。随后把已有 contract 基础的剩余页面接入 `MOBILE_PAGE_ORDER` 与前端注册表，完成一轮端到端年报推进。

**Tech Stack:** Python, pytest, Vue 3, Vitest, Vite

---

### Task 1: 锁定本轮口径修正的失败测试

**Files:**
- Modify: `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js`
- Modify: `tests/python/test_year_report_contract_builder.py`

- [ ] **Step 1: 为 P08/P09/P11/L04 的新口径补前端断言**

在 `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js` 追加或修改断言：

```js
it('P08 优先展示中文曲风标签，而不是英文内部路径', () => {
  const wrapper = mount(P08GenreRankingPage, {
    props: {
      page: sampleContract.pages.find((page) => page.page_id === 'P08'),
    },
  })

  expect(wrapper.text()).toContain('日系流行')
  expect(wrapper.text()).not.toContain('Pop---J-pop')
})

it('P09 月度时间线优先展示中文曲风标签', () => {
  const wrapper = mount(P09GenreTimelinePage, {
    props: {
      page: sampleContract.pages.find((page) => page.page_id === 'P09'),
    },
  })

  expect(wrapper.text()).toContain('日系流行')
  expect(wrapper.text()).not.toContain('Pop---J-pop')
})

it('P11 会展示其他颜色聚合项，让可见占比口径闭合', () => {
  const wrapper = mount(P11CoverColorPage, {
    props: {
      page: {
        page_id: 'P11',
        section: '封面颜色',
        title: '年度封面主色',
        summary_text: 'summary',
        payload: {
          cover_color_summary: {
            counted_track_total: 100,
            excluded_track_total: 0,
            treemap_total: 100,
            top_colors: [
              { color_hex: '#111111', track_count: 30, representative_track_title: 'Song A', representative_artist_display: '歌手A', share_ratio: 0.3, tone_label: '深灰' },
              { color_hex: '#222222', track_count: 25, representative_track_title: 'Song B', representative_artist_display: '歌手B', share_ratio: 0.25, tone_label: '炭灰' },
              { color_hex: '#333333', track_count: 20, representative_track_title: 'Song C', representative_artist_display: '歌手C', share_ratio: 0.2, tone_label: '雾灰' },
              { color_hex: '#CFCFD6', track_count: 25, representative_track_title: '其余颜色分布', representative_artist_display: '', share_ratio: 0.25, tone_label: '其他颜色', is_other_bucket: true },
            ],
          },
        },
      },
    },
  })

  expect(wrapper.text()).toContain('其他颜色')
  expect(wrapper.text()).toContain('25.0%')
})

it('L04B 不再直接渲染未拆分的协作歌手整串', () => {
  const wrapper = mount(L04NewArtistRankingPage, {
    props: {
      page: {
        page_id: 'L04B',
        section: '歌手章节',
        title: '年度新增歌手榜',
        summary_text: 'summary',
        payload: {
          ranking: [
            { rank: 1, artist_display: '浅影阿', new_track_total: 8, new_album_total: 3 },
            { rank: 2, artist_display: '汐音社', new_track_total: 6, new_album_total: 2 },
          ],
        },
      },
    },
  })

  expect(wrapper.text()).toContain('浅影阿')
  expect(wrapper.text()).toContain('汐音社')
  expect(wrapper.text()).not.toContain('浅影阿;汐音社')
})
```

- [ ] **Step 2: 运行前端测试，确认新断言先失败**

Run: `npm run test -- src/__tests__/year-report-mobile-app.test.js`

Workdir: `tools/year-report-app`

Expected: 至少出现 P08/P09/P11 相关失败，说明测试确实卡住了旧行为。

- [ ] **Step 3: 为 Python contract 层补失败测试**

在 `tests/python/test_year_report_contract_builder.py` 追加覆盖：

```python
def test_p11_collapses_remaining_colors_into_other_bucket():
    report = build_year_report_contract({
        'year': 2026,
        'play_history': [
            {'year': 2026, 'track_id': f't{i}', 'track_title': f'Song {i}', 'artist_display': f'歌手{i}', 'played_at': '2026-01-01 08:00:00'}
            for i in range(1, 8)
        ],
        'library_tracks': [
            {'track_id': 't1', 'track_title': 'Song 1', 'artist_display': '歌手1', 'cover_color': '#111111'},
            {'track_id': 't2', 'track_title': 'Song 2', 'artist_display': '歌手2', 'cover_color': '#222222'},
            {'track_id': 't3', 'track_title': 'Song 3', 'artist_display': '歌手3', 'cover_color': '#333333'},
            {'track_id': 't4', 'track_title': 'Song 4', 'artist_display': '歌手4', 'cover_color': '#444444'},
            {'track_id': 't5', 'track_title': 'Song 5', 'artist_display': '歌手5', 'cover_color': '#555555'},
            {'track_id': 't6', 'track_title': 'Song 6', 'artist_display': '歌手6', 'cover_color': '#666666'},
            {'track_id': 't7', 'track_title': 'Song 7', 'artist_display': '歌手7', 'cover_color': '#777777'},
        ],
    })
    p11 = next(page for page in report['pages'] if page['page_id'] == 'P11')
    other_bucket = next(item for item in p11['payload']['cover_color_summary']['top_colors'] if item.get('is_other_bucket'))

    assert other_bucket['tone_label'] == '其他颜色'
    assert other_bucket['track_count'] == 2
    assert other_bucket['share_ratio'] == 0.2857


def test_l04b_splits_semicolon_separated_artist_display():
    report = build_year_report_contract({
        'year': 2026,
        'play_history': [],
        'library_tracks': [
            {'track_id': 'a1', 'track_title': '合唱 1', 'artist_display': '浅影阿;汐音社', 'album_display': '专辑A', 'first_added_year': 2026},
            {'track_id': 'a2', 'track_title': '合唱 2', 'artist_display': '浅影阿;汐音社', 'album_display': '专辑B', 'first_added_year': 2026},
            {'track_id': 'a3', 'track_title': '独唱 1', 'artist_display': '浅影阿', 'album_display': '专辑C', 'first_added_year': 2026},
        ],
    })
    l04b = next(page for page in report['pages'] if page['page_id'] == 'L04B')
    names = [item['artist_display'] for item in l04b['payload']['ranking']]

    assert '浅影阿;汐音社' not in names
    assert '浅影阿' in names
    assert '汐音社' in names
```

- [ ] **Step 4: 运行 Python 测试，确认先失败**

Run: `python -m pytest tests/python/test_year_report_contract_builder.py -v`

Expected: 新增的 `P11` / `L04B` 用例失败，证明旧 contract 口径还没满足要求。

- [ ] **Step 5: Commit**

```bash
git add tools/year-report-app/src/__tests__/year-report-mobile-app.test.js tests/python/test_year_report_contract_builder.py
git commit -m "test(year-report): define page fixes for genre color and artist split"
```

### Task 2: 修复 Python contract 口径

**Files:**
- Modify: `scripts/year_report/year_report_contract_builder.py`
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_contract_builder.py`

- [ ] **Step 1: 实现歌手拆分辅助函数并接入歌手分组**

在 `scripts/year_report/build_year_report.py` 中新增最小实现：

```python
def _split_artist_display_values(raw_artist_display: Any) -> list[str]:
    """按安全分隔符拆歌手展示名，避免把协作串名当成单个歌手。"""
    if not _has_value(raw_artist_display):
        return []
    normalized = str(raw_artist_display).replace('；', ';')
    parts = [part.strip() for part in normalized.split(';')]
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        if not part or part in seen:
            continue
        seen.add(part)
        result.append(part)
    return result


def _group_tracks_by_artist(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """按歌手分组，并对安全协作分隔符做拆分聚合。"""
    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        artist_names = _split_artist_display_values(row.get('artist_display'))
        for artist_name in artist_names:
            grouped_rows[artist_name].append(row)
    return grouped_rows
```

- [ ] **Step 2: 实现 P11 “其他颜色”聚合桶**

在 `scripts/year_report/year_report_contract_builder.py` 的 `_build_cover_color_summary_for_page()` 中，把展示主色限制为 5 个，并把尾部聚合进“其他颜色”：

```python
    display_colors = list(base_summary.get('top_colors', []) or [])
    normalized_top_colors = []
    for item in display_colors:
        track_count = int(item.get('track_count') or 0)
        color_hex = str(item.get('color_hex') or '').strip()
        normalized_top_colors.append({
            **item,
            'color_hex': color_hex,
            'share_ratio': round(track_count / treemap_total, 4) if treemap_total else 0.0,
            'tone_label': _describe_color_tone(color_hex),
        })

    primary_colors = normalized_top_colors[:5]
    remaining_colors = normalized_top_colors[5:]
    if remaining_colors:
        other_track_total = sum(int(item.get('track_count') or 0) for item in remaining_colors)
        primary_colors.append({
            'color_hex': '#CFCFD6',
            'track_count': other_track_total,
            'representative_track_title': '其余颜色分布',
            'representative_artist_display': '',
            'representative_cover_path': None,
            'share_ratio': round(other_track_total / treemap_total, 4) if treemap_total else 0.0,
            'tone_label': '其他颜色',
            'is_other_bucket': True,
        })
```

- [ ] **Step 3: 为 P09 timeline 补中文主曲风字段**

在 `_build_p09_page()` 中追加：

```python
        timeline.append({
            'month': month,
            'top_genre': ranking[0]['genre_name'],
            'top_genre_zh': ranking[0]['genre_name_zh'],
            'top_primary_genre': ranking[0]['genre_name'],
            'top_primary_genre_zh': ranking[0]['genre_name_zh'],
            'top_weighted_play_total': ranking[0]['weighted_play_total'],
            'genre_weights': ranking[:3],
        })
```

并把 `P08 / P09` 的 `summary_text` 改成优先使用中文字段。

- [ ] **Step 4: 运行 Python 测试确认转绿**

Run: `python -m pytest tests/python/test_year_report_contract_builder.py -v`

Expected: 新增测试转绿，且原有 contract builder 用例无回归失败。

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/build_year_report.py scripts/year_report/year_report_contract_builder.py tests/python/test_year_report_contract_builder.py
git commit -m "fix(year-report): normalize genre labels color shares and artist split"
```

### Task 3: 修复前端页面展示逻辑

**Files:**
- Modify: `tools/year-report-app/src/pages/P08GenreRankingPage.vue`
- Modify: `tools/year-report-app/src/pages/P09GenreTimelinePage.vue`
- Modify: `tools/year-report-app/src/pages/P11CoverColorPage.vue`
- Modify: `tools/year-report-app/src/pages/L04LibraryArtistRankingPage.vue`
- Modify: `tools/year-report-app/src/pages/L04NewArtistRankingPage.vue`
- Test: `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js`

- [ ] **Step 1: P08 / P09 页面优先使用中文曲风字段**

在两个 Vue 页面中新增轻量 label 解析函数：

```js
function resolveGenreLabel(item) {
  if (item?.genre_name_zh) return item.genre_name_zh
  if (item?.top_genre_zh) return item.top_genre_zh
  if (item?.genre_name) return item.genre_name
  if (item?.top_genre) return item.top_genre
  return '未知曲风'
}
```

并把模板里的 `item.genre_name` / `item.top_genre` 替换为该函数结果。

- [ ] **Step 2: P11 页面兼容“其他颜色”聚合项**

保持 treemap 直接使用 `topColorItems`，但把 legend 文案构造改得更稳：

```js
function buildRepresentativeLabel(item) {
  if (item?.is_other_bucket) {
    return '未进入主展示色块的其余颜色'
  }
  const trackTitle = item?.representative_track_title || '代表封面'
  const artistDisplay = item?.representative_artist_display
  return artistDisplay ? `${trackTitle} · ${artistDisplay}` : trackTitle
}
```

- [ ] **Step 3: L04 页面保持纯 Top10 列表，但兼容拆分后的真实榜单**

这里只需要保证 key 与文案继续稳定，不再假定 `artist_display` 可能是协作整串：

```js
:key="`new-${item.artist_display || index}`"
<strong>{{ item.artist_display || '未知歌手' }}</strong>
```

不新增前端拆分逻辑，明确把口径留在 Python 层。

- [ ] **Step 4: 运行前端测试确认转绿**

Run: `npm run test -- src/__tests__/year-report-mobile-app.test.js`

Workdir: `tools/year-report-app`

Expected: P08 / P09 / P11 / L04 相关用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add tools/year-report-app/src/pages/P08GenreRankingPage.vue tools/year-report-app/src/pages/P09GenreTimelinePage.vue tools/year-report-app/src/pages/P11CoverColorPage.vue tools/year-report-app/src/pages/L04LibraryArtistRankingPage.vue tools/year-report-app/src/pages/L04NewArtistRankingPage.vue tools/year-report-app/src/__tests__/year-report-mobile-app.test.js
git commit -m "fix(year-report-app): render zh genre labels and other color bucket"
```

### Task 4: 接入 P24 / L02 / L03 / P32 到移动端页面序列

**Files:**
- Modify: `scripts/year_report/year_report_contract_builder.py`
- Modify: `tools/year-report-app/src/lib/pageRegistry.js`
- Modify: `tools/year-report-app/src/composables/useReportData.js`（如需要仅排序兼容）
- Create: `tools/year-report-app/src/pages/P24AlbumRankingPage.vue`
- Create: `tools/year-report-app/src/pages/L02LibraryGrowthPage.vue`
- Create: `tools/year-report-app/src/pages/L03LibraryStructurePage.vue`
- Create: `tools/year-report-app/src/pages/P32YearSummaryPage.vue`
- Modify: `tools/year-report-app/src/styles.css`
- Modify: `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js`

- [ ] **Step 1: 先为新增页面写前端存在性测试**

在 `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js` 中新增断言，至少覆盖：

```js
expect(wrapper.text()).toContain('年度最爱专辑榜')
expect(wrapper.text()).toContain('年度新增分析')
expect(wrapper.text()).toContain('歌曲库结构分析')
expect(wrapper.text()).toContain('年度总结四格')
```

并为各页面单独 mount 最小 payload，验证核心 DOM 存在。

- [ ] **Step 2: 运行前端测试确认新增页面测试先失败**

Run: `npm run test -- src/__tests__/year-report-mobile-app.test.js`

Expected: 因注册表缺页或组件缺失而失败。

- [ ] **Step 3: 把剩余页面加入移动端 contract 顺序**

在 `scripts/year_report/year_report_contract_builder.py` 中：

```python
MOBILE_PAGE_ORDER = [
    'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
    'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
    'P21', 'P23', 'P24', 'P25', 'L02', 'L03', 'L04A', 'L04B', 'P32',
]
```

并在 `build_year_report_contract()` 里插入：

```python
        _build_p23_page(context),
        _build_p24_page(context),
        _build_p25_page(context),
        _build_l02_page(context),
        _build_l03_page(context),
        _build_l04a_page(context),
        _build_l04b_page(context),
        _build_p32_page(context),
```

- [ ] **Step 4: 用最小组件实现 P24 / L02 / L03 / P32**

每个页面沿用现有 `ReportPageShell` 和已存在的视觉卡片类，保持小而可测：

```vue
<template>
  <ReportPageShell :page="page">
    <div class="hero-layout">
      <div class="hero-copy">
        <p class="hero-tag">Album ranking</p>
        <h2 class="hero-title">{{ page.title }}</h2>
        <p class="hero-subtitle">把这一年最常循环的专辑完整展开。</p>
      </div>
      <section class="ranking-panel">
        <ol class="ranking-list">
          <li v-for="item in page.payload.album_ranking || []" :key="`${item.rank}-${item.album_display}`" class="ranking-item">
            <strong>{{ item.album_display }}</strong>
            <span>{{ item.play_total }} 次</span>
          </li>
        </ol>
      </section>
    </div>
  </ReportPageShell>
</template>
```

L02 / L03 / P32 同理，只渲染 contract 中已有主字段，不额外发明复杂交互。

- [ ] **Step 5: 更新注册表并跑前端测试**

Run: `npm run test -- src/__tests__/year-report-mobile-app.test.js`

Expected: 新页面测试转绿。

- [ ] **Step 6: Commit**

```bash
git add scripts/year_report/year_report_contract_builder.py tools/year-report-app/src/lib/pageRegistry.js tools/year-report-app/src/pages/P24AlbumRankingPage.vue tools/year-report-app/src/pages/L02LibraryGrowthPage.vue tools/year-report-app/src/pages/L03LibraryStructurePage.vue tools/year-report-app/src/pages/P32YearSummaryPage.vue tools/year-report-app/src/styles.css tools/year-report-app/src/__tests__/year-report-mobile-app.test.js
git commit -m "feat(year-report-app): add remaining album library and summary pages"
```

### Task 5: 最终验证与产物检查

**Files:**
- Modify: `tools/year-report-app/public/report-contract.sample.json`（如新增页需要 sample）
- Modify: `tools/year-report-app/public/report-contract.json`（若本地重建）

- [ ] **Step 1: 确认 sample / 正式 contract 已包含新增页面与修正字段**

Run:

```bash
python -c "import json, pathlib; p=pathlib.Path('tools/year-report-app/public/report-contract.sample.json'); obj=json.loads(p.read_text(encoding='utf-8')); print(obj['meta']['page_order'])"
python -c "import json, pathlib; p=pathlib.Path('tools/year-report-app/public/report-contract.json'); obj=json.loads(p.read_text(encoding='utf-8')); print(obj['meta']['page_order'])"
```

Expected: 两份 contract 的顺序都包含 `P24 / L02 / L03 / P32`，且 `P08/P09/P11/L04` 对应 payload 字段已更新。

- [ ] **Step 2: 跑 Python 测试**

Run: `python -m pytest tests/python/test_year_report_contract_builder.py -v`

Expected: 0 failures。

- [ ] **Step 3: 跑前端测试**

Run: `npm run test -- src/__tests__/year-report-mobile-app.test.js && npm run test -- src/__tests__/pdf-export.test.js && npm run test -- src/__tests__/report-data-loading.test.js`

Workdir: `tools/year-report-app`

Expected: 全部通过。

- [ ] **Step 4: 跑前端构建**

Run: `npm run build`

Workdir: `tools/year-report-app`

Expected: `vite build` 成功，无导出期 color 解析回归。

- [ ] **Step 5: Commit**

```bash
git add tools/year-report-app/public/report-contract.sample.json tools/year-report-app/public/report-contract.json
git commit -m "chore(year-report): refresh contracts after page fixes and additions"
```
