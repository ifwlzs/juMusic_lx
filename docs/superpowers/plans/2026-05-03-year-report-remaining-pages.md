# Year Report Remaining Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐年度报告剩余 5 个页面（`P20`、`P23`、`P24`、`L02`、`P32`）的最小可用聚合逻辑、字段 contract 与自动化测试。

**Architecture:** 在 `scripts/year_report/build_year_report.py` 中新增小而清晰的聚合辅助函数，优先复用现有页面与共享口径；`P23/P24` 共用专辑聚合，`P32` 只拼装已有结果不直接扫描原始输入。所有实现严格按 TDD 执行，先补失败测试，再写最小实现，最后回归现有年报测试集。

**Tech Stack:** Python 3、pytest、现有 `build_year_report.py` 骨架与 `tests/python/test_year_report_build.py`

---

### Task 1: 补齐 `P20` 深夜听歌页

**Files:**
- Modify: `tests/python/test_year_report_build.py`
- Modify: `scripts/year_report/build_year_report.py`

- [ ] **Step 1: Write the failing test**

```python
def test_build_year_report_aggregates_p20_latest_night_record_and_representative_tracks():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'track_id': 't1',
                'track_title': '夜航星',
                'artist_display': '不才',
                'latest_time': '02:35',
                'night_sort_minute': 1595,
                'cover_path': 'covers/t1.jpg',
            },
            {
                'year': 2025,
                'track_id': 't1',
                'track_title': '夜航星',
                'artist_display': '不才',
                'latest_time': '01:45',
                'night_sort_minute': 1545,
                'cover_path': 'covers/t1.jpg',
            },
            {
                'year': 2025,
                'track_id': 't2',
                'track_title': '海底',
                'artist_display': '一支榴莲',
                'latest_time': '01:20',
                'night_sort_minute': 1520,
                'cover_path': 'covers/t2.jpg',
            },
            {
                'year': 2024,
                'track_id': 'old',
                'track_title': '旧年深夜歌',
                'artist_display': '旧歌手',
                'latest_time': '03:00',
                'night_sort_minute': 1620,
                'cover_path': 'covers/old.jpg',
            },
        ],
    })
    p20 = {page['page_id']: page for page in report['pages']}['P20']

    assert p20['latest_night_record']['track_title'] == '夜航星'
    assert p20['latest_night_record']['latest_time'] == '02:35'
    assert p20['late_night_total'] == 3
    assert p20['late_night_track_total'] == 2
    assert [item['track_title'] for item in p20['representative_tracks']] == ['夜航星', '海底']
    assert p20['representative_tracks'][0]['late_night_play_total'] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_year_report_build.py -k p20_latest_night_record -v`
Expected: FAIL，因为 `P20` 仍是占位结构，缺少 `latest_night_record` 与 `representative_tracks` 聚合。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中新增：

```python
def _build_p20(context: dict[str, Any]) -> dict[str, Any]:
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    night_rows = [row for row in year_rows if isinstance(row.get('night_sort_minute'), int)]
    latest_night_record = _build_latest_night_record(night_rows)
    representative_tracks = _aggregate_late_night_tracks(night_rows)
    page = _base_page('P20', context['year'], '这一页用于展示本年度最晚听歌时刻与深夜活跃夜晚数。')
    page['latest_night_record'] = latest_night_record
    page['late_night_total'] = len(night_rows)
    page['late_night_track_total'] = len({row.get('track_id') or row.get('track_title') for row in night_rows if _has_value(row.get('track_id')) or _has_value(row.get('track_title'))})
    page['representative_tracks'] = representative_tracks
    return page
```

并补充 `_filter_year_rows()`、`_build_latest_night_record()`、`_aggregate_late_night_tracks()` 等最小辅助函数。

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/python/test_year_report_build.py -k p20_latest_night_record -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_build.py scripts/year_report/build_year_report.py
git commit -m "feat: add year report p20 aggregation"
```

### Task 2: 补齐 `P23/P24` 专辑聚合

**Files:**
- Modify: `tests/python/test_year_report_build.py`
- Modify: `scripts/year_report/build_year_report.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_build_year_report_aggregates_p23_top_album_and_p24_album_ranking():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {'year': 2025, 'track_id': 'a1', 'track_title': 'Song A1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'play_count': 5, 'active_days': 3, 'listened_sec': 500, 'cover_path': 'covers/a.jpg'},
            {'year': 2025, 'track_id': 'a2', 'track_title': 'Song A2', 'artist_display': 'Aimer', 'album_display': 'Album A', 'play_count': 4, 'active_days': 2, 'listened_sec': 420, 'cover_path': 'covers/a.jpg'},
            {'year': 2025, 'track_id': 'b1', 'track_title': 'Song B1', 'artist_display': 'YOASOBI', 'album_display': 'Album B', 'play_count': 6, 'active_days': 2, 'listened_sec': 360, 'cover_path': 'covers/b.jpg'},
            {'year': 2025, 'track_id': 'x1', 'track_title': 'Unknown Song', 'artist_display': 'Unknown', 'album_display': 'unknown', 'play_count': 100, 'active_days': 10, 'listened_sec': 999, 'cover_path': 'covers/x.jpg'},
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    p23 = pages['P23']
    p24 = pages['P24']

    assert p23['top_album']['album_display'] == 'Album A'
    assert p23['top_album']['play_total'] == 9
    assert p23['top_album']['track_total'] == 2
    assert p23['top_album']['representative_track_title'] == 'Song A1'
    assert [item['album_display'] for item in p24['album_ranking']] == ['Album A', 'Album B']
    assert p24['album_ranking'][0]['rank'] == 1
    assert p24['album_ranking'][1]['rank'] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/python/test_year_report_build.py -k "p23_top_album or p24_album_ranking" -v`
Expected: FAIL，因为 `P23/P24` 目前仍是空结构。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中补：

```python
def _build_p23(context: dict[str, Any]) -> dict[str, Any]:
    album_ranking = _aggregate_album_ranking(context['play_history'], context['year'])
    page = _base_page('P23', context['year'], '展示年度之最专辑及其代表歌曲。')
    page['top_album'] = album_ranking[0] if album_ranking else None
    return page


def _build_p24(context: dict[str, Any]) -> dict[str, Any]:
    album_ranking = _aggregate_album_ranking(context['play_history'], context['year'])
    page = _base_page('P24', context['year'], '展示年度最爱专辑榜单。')
    page['album_ranking'] = album_ranking
    return page
```

并实现 `_is_valid_album_name()`、`_aggregate_album_ranking()`，统一处理无效专辑过滤、排序与代表歌曲选取。

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_year_report_build.py -k "p23_top_album or p24_album_ranking" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_build.py scripts/year_report/build_year_report.py
git commit -m "feat: add year report album aggregations"
```

### Task 3: 补齐 `L02` 年度新增分析

**Files:**
- Modify: `tests/python/test_year_report_build.py`
- Modify: `scripts/year_report/build_year_report.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_build_year_report_aggregates_l02_growth_metrics_and_monthly_growth():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {'track_id': 't1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025, 'first_added_month': 1},
            {'track_id': 't2', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025, 'first_added_month': 1},
            {'track_id': 't3', 'artist_display': 'YOASOBI', 'album_display': 'Album B', 'first_added_year': 2025, 'first_added_month': 2},
            {'track_id': 't4', 'artist_display': 'ZUTOMAYO', 'album_display': 'Album Z', 'first_added_year': 2024, 'first_added_month': 12},
        ],
    })
    l02 = {page['page_id']: page for page in report['pages']}['L02']

    assert l02['growth_metrics'] == {
        'new_track_total': 3,
        'new_artist_total': 2,
        'new_album_total': 2,
    }
    assert l02['monthly_growth'] == [
        {'month': 1, 'new_track_total': 2, 'new_artist_total': 1, 'new_album_total': 1},
        {'month': 2, 'new_track_total': 1, 'new_artist_total': 1, 'new_album_total': 1},
    ]


def test_build_year_report_returns_empty_l02_monthly_growth_when_month_is_missing():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {'track_id': 't1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025},
        ],
    })
    l02 = {page['page_id']: page for page in report['pages']}['L02']

    assert l02['growth_metrics']['new_track_total'] == 1
    assert l02['monthly_growth'] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/python/test_year_report_build.py -k l02_growth -v`
Expected: FAIL，因为 `L02` 目前返回占位数据。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中补：

```python
def _build_l02(context: dict[str, Any]) -> dict[str, Any]:
    new_tracks = [row for row in context['library_tracks'] if row.get('first_added_year') == context['year']]
    page = _base_page('L02', context['year'], '展示本年度新增歌曲、歌手、专辑及月度新增趋势。')
    page['growth_metrics'] = _build_growth_metrics(new_tracks)
    page['monthly_growth'] = _build_monthly_growth(new_tracks)
    return page
```

并实现 `_build_growth_metrics()`、`_build_monthly_growth()`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_year_report_build.py -k l02_growth -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_build.py scripts/year_report/build_year_report.py
git commit -m "feat: add year report growth metrics"
```

### Task 4: 补齐 `P32` 年度总结四格

**Files:**
- Modify: `tests/python/test_year_report_build.py`
- Modify: `scripts/year_report/build_year_report.py`

- [ ] **Step 1: Write the failing test**

```python
def test_build_year_report_builds_p32_summary_cards_from_existing_sections():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {'year': 2025, 'track_id': 't1', 'track_title': '夜航星', 'artist_display': '不才', 'latest_time': '02:35', 'night_sort_minute': 1595, 'album_display': 'Album A', 'play_count': 5, 'active_days': 3, 'listened_sec': 500, 'cover_path': 'covers/t1.jpg'},
            {'year': 2025, 'track_id': 't2', 'track_title': 'Song A2', 'artist_display': 'Aimer', 'album_display': 'Album A', 'play_count': 4, 'active_days': 2, 'listened_sec': 420, 'cover_path': 'covers/t1.jpg'},
        ],
        'library_tracks': [
            {'track_id': 'n1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025, 'primary_genre': 'J-Pop', 'cover_color': '#112233'},
            {'track_id': 'n2', 'artist_display': 'YOASOBI', 'album_display': 'Album B', 'first_added_year': 2025, 'primary_genre': 'Anime', 'cover_color': '#223344'},
        ],
    })
    p32 = {page['page_id']: page for page in report['pages']}['P32']

    card_ids = [card['card_id'] for card in p32['summary_cards']]

    assert 'latest-night' in card_ids
    assert 'top-album' in card_ids
    assert 'top-new-artist' in card_ids
    assert 'library-structure' in card_ids
    assert p32['summary_text']
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_year_report_build.py -k p32_summary_cards -v`
Expected: FAIL，因为 `P32` 目前返回空 `summary_cards`。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中调整年报构建流：

```python
def build_year_report(report_input: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized_input = report_input or {}
    year = _resolve_year(normalized_input)
    context = {
        'year': year,
        'play_history': normalized_input.get('play_history', []) or [],
        'library_tracks': normalized_input.get('library_tracks', []) or [],
        'genre_matches': normalized_input.get('genre_matches', []) or [],
    }
    pages = []
    page_map = {}
    for page_id in CONFIRMED_PAGE_SEQUENCE:
        page = _build_page(page_id, context, page_map)
        pages.append(page)
        page_map[page_id] = page
    return {'year': year, 'pages': pages}
```

并让 `_build_p32()` 读取 `page_map['P20']`、`page_map['P23']`、`page_map['L04']`、`page_map['L03']` 来拼装四张卡片。

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/python/test_year_report_build.py -k p32_summary_cards -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_build.py scripts/year_report/build_year_report.py
git commit -m "feat: add year report summary cards"
```

### Task 5: 全量年报回归与 contract 校验

**Files:**
- Modify: `docs/superpowers/references/year-report-v2-field-contract.md`
- Modify: `tests/python/test_year_report_build.py`
- Modify: `scripts/year_report/build_year_report.py`（如回归修补需要）

- [ ] **Step 1: Update contract doc for the 5 new pages**

在 `docs/superpowers/references/year-report-v2-field-contract.md` 中新增 `P20`、`P23`、`P24`、`L02`、`P32` 的字段说明、排序口径与降级规则，确保文档与代码对齐。

- [ ] **Step 2: Run the full year-report test suite**

Run: `python -m pytest tests/python/test_year_report_build.py -v`
Expected: PASS，所有原有与新增年报测试均通过。

- [ ] **Step 3: Run the cross-module regression suite**

Run: `python -m pytest tests/python/test_load_music_info.py tests/python/test_year_report_build.py -v`
Expected: PASS，避免年报改动影响既有 Python 脚本测试。

- [ ] **Step 4: Review spec coverage**

核对 `docs/superpowers/specs/2026-05-03-year-report-remaining-pages-design.md` 的每一节是否都已在：
- `scripts/year_report/build_year_report.py`
- `tests/python/test_year_report_build.py`
- `docs/superpowers/references/year-report-v2-field-contract.md`
中落地。

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/references/year-report-v2-field-contract.md tests/python/test_year_report_build.py scripts/year_report/build_year_report.py
git commit -m "feat: complete year report remaining page aggregations"
```
