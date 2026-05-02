# Year Report Batch 2 (P05 / P06 / P09 / P10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为年报 MVP 新增 P05、P06、P09、P10 四个页面的数据查询、报告组装与 HTML 展示，并保持现有 Python/Node 测试链路可验证。

**Architecture:** 继续沿用现有“SQL 数据集 -> Python build_report 组装 -> HTML/JS 渲染”的三层结构。P05/P09 由 `year_report_queries.py` 直接提供聚合数据；P06/P10 由查询层返回原始输入，再在 `build_year_report.py` 中做关键词抽取、口味评分和总结文案，前端只负责展示。

**Tech Stack:** Python 3、pytest、MSSQL SQL、Node.js 内置 test runner、静态 HTML/CSS/JavaScript。

---

## File Structure / Ownership

### Existing files to modify

- `scripts/year_report/year_report_queries.py`
  - 扩展支持的数据集列表、shape 映射与 SQL 文本。
  - 新增 `data_p05_explore_repeat`、`data_p06_keyword_source_rows`、`data_p09_genre_evolution`、`data_p10_taste_inputs`。
- `scripts/year_report/build_year_report.py`
  - 读取新增数据集。
  - 组装 `P05/P06/P09/P10` 页面对象。
  - 新增最小关键词抽取、评分与文案逻辑。
- `tests/python/test_year_report_queries.py`
  - 为新增 4 个数据集补红灯测试。
- `tests/python/test_build_year_report.py`
  - 为新增 4 个页面补红灯测试与示例 payload。
- `tools/year-report/show_year_report.html`
  - 新增 P05/P06/P09/P10 卡片壳。
- `tools/year-report/year-report-app.js`
  - 新增渲染函数与注册表接入。
- `tests/year-report/year-report-html.test.js`
  - 为 HTML 壳和渲染函数补红灯测试。

### No new production files expected

本轮不新增独立生产文件，尽量把逻辑限制在现有年报脚本和页面文件里，避免扩散结构。

---

### Task 1: 补 Python 查询层测试（新增数据集契约）

**Files:**
- Modify: `tests/python/test_year_report_queries.py`
- Test: `tests/python/test_year_report_queries.py`

- [ ] **Step 1: Write the failing test**

在 `tests/python/test_year_report_queries.py` 中追加以下断言：

```python
assert module.SUPPORTED_DATASETS == (
    'data_p01_summary',
    'data_p02_overview',
    'data_p03_explore',
    'data_p05_explore_repeat',
    'data_p06_keyword_source_rows',
    'data_p08_genres',
    'data_p09_genre_evolution',
    'data_p10_taste_inputs',
    'data_p12_spring',
    'data_p13_summer',
    'data_p14_autumn',
    'data_p15_winter',
    'data_p16_artist_of_year',
    'data_p17_weekly_pattern',
    'data_p18_calendar',
    'data_p19_time_bucket',
    'data_p20_night',
    'data_p22_repeat_tracks',
    'data_p23_album_of_year',
    'data_p24_top_albums',
    'data_p25_song_of_year',
    'data_p26_top_tracks',
    'data_p27_top_artists',
    'data_p28_artist_journey',
    'data_p29_artist_rank_detail',
    'data_p30_yearly_artist_rank',
    'data_p31_credits',
)
```

并在 `test_map_rows_to_dataset_payload_shapes` 中新增：

```python
p05 = module.map_rows_to_dataset_payload('data_p05_explore_repeat', [{
    'row_type': 'summary', 'metric_key': 'explore', 'play_count': 40, 'track_count': 25,
    'active_days': 18, 'ratio': 0.4, 'track_id': None, 'title': None, 'artist': None,
    'source_type': None, 'text_value': None, 'genre': None, 'period_key': None,
}])
p06 = module.map_rows_to_dataset_payload('data_p06_keyword_source_rows', [{
    'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'source_type': 'lyric',
    'text_value': '[00:01.00]hello world hello'
}])
p09 = module.map_rows_to_dataset_payload('data_p09_genre_evolution', [{
    'period_key': '2025-01', 'genre': 'J-Pop', 'new_track_count': 3, 'ratio': 0.6
}])
p10 = module.map_rows_to_dataset_payload('data_p10_taste_inputs', [{
    'genre': 'J-Pop', 'play_count': 20, 'new_track_count': 3, 'is_new_genre': 1
}])

assert p05[0]['row_type'] == 'summary'
assert p06[0]['source_type'] == 'lyric'
assert p09[0]['period_key'] == '2025-01'
assert p10[0]['genre'] == 'J-Pop'
```

并在 `test_dataset_structure_contracts` 中新增：

```python
assert module.DATASET_SHAPES['data_p05_explore_repeat'] == 'many'
assert module.DATASET_SHAPES['data_p06_keyword_source_rows'] == 'many'
assert module.DATASET_SHAPES['data_p09_genre_evolution'] == 'many'
assert module.DATASET_SHAPES['data_p10_taste_inputs'] == 'many'
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest tests/python/test_year_report_queries.py -q
```

Expected: FAIL，原因是 `SUPPORTED_DATASETS` / `DATASET_SHAPES` 尚未包含 P05/P06/P09/P10 数据集。

- [ ] **Step 3: Write minimal implementation**

先不要实现完整 SQL，只在：

- `scripts/year_report/year_report_queries.py`

中补最小结构：

```python
SUPPORTED_DATASETS = (
    # ...existing datasets...
    'data_p05_explore_repeat',
    'data_p06_keyword_source_rows',
    'data_p09_genre_evolution',
    'data_p10_taste_inputs',
    # ...remaining datasets...
)

DATASET_SHAPES.update({
    'data_p05_explore_repeat': 'many',
    'data_p06_keyword_source_rows': 'many',
    'data_p09_genre_evolution': 'many',
    'data_p10_taste_inputs': 'many',
})

DATASET_SQL.update({
    'data_p05_explore_repeat': "DECLARE @year int = %s; SELECT 1 AS placeholder WHERE 1 = 0;",
    'data_p06_keyword_source_rows': "DECLARE @year int = %s; SELECT 1 AS placeholder WHERE 1 = 0;",
    'data_p09_genre_evolution': "DECLARE @year int = %s; SELECT 1 AS placeholder WHERE 1 = 0;",
    'data_p10_taste_inputs': "DECLARE @year int = %s; SELECT 1 AS placeholder WHERE 1 = 0;",
})
```

保持 `map_rows_to_dataset_payload()` 仍按 `many` 返回列表即可。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pytest tests/python/test_year_report_queries.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_queries.py scripts/year_report/year_report_queries.py
git commit -m "test: add year report batch2 dataset contracts"
```

---

### Task 2: 补 Python 报告组装测试（新增页面契约）

**Files:**
- Modify: `tests/python/test_build_year_report.py`
- Test: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Write the failing test**

在 `sample_dataset_payloads()` 中加入：

```python
'data_p05_explore_repeat': [
    {'row_type': 'summary', 'metric_key': 'explore', 'play_count': 40, 'track_count': 25, 'active_days': 18, 'ratio': 0.4, 'track_id': None, 'title': None, 'artist': None},
    {'row_type': 'summary', 'metric_key': 'repeat', 'play_count': 60, 'track_count': 15, 'active_days': 30, 'ratio': 0.6, 'track_id': None, 'title': None, 'artist': None},
    {'row_type': 'track', 'metric_key': 'search_top', 'play_count': 8, 'track_count': None, 'active_days': None, 'ratio': None, 'track_id': 't9', 'title': 'Search Song', 'artist': 'Artist S'},
    {'row_type': 'track', 'metric_key': 'repeat_top', 'play_count': 12, 'track_count': None, 'active_days': 10, 'ratio': None, 'track_id': 't8', 'title': 'Repeat Song', 'artist': 'Artist R'},
],
'data_p06_keyword_source_rows': [
    {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'source_type': 'lyric', 'text_value': '[00:01.00]hello world hello dream'},
    {'track_id': 't2', 'title': 'Dream Song', 'artist': 'Artist B', 'source_type': 'title', 'text_value': 'Dream Song'},
],
'data_p09_genre_evolution': [
    {'period_key': '2025-01', 'genre': 'J-Pop', 'new_track_count': 3, 'ratio': 0.6},
    {'period_key': '2025-01', 'genre': 'Anime', 'new_track_count': 2, 'ratio': 0.4},
    {'period_key': '2025-02', 'genre': 'Vocaloid', 'new_track_count': 4, 'ratio': 1.0},
],
'data_p10_taste_inputs': [
    {'genre': 'J-Pop', 'play_count': 30, 'new_track_count': 4, 'is_new_genre': 1},
    {'genre': 'Anime', 'play_count': 20, 'new_track_count': 2, 'is_new_genre': 0},
    {'genre': 'Vocaloid', 'play_count': 10, 'new_track_count': 1, 'is_new_genre': 1},
],
```

把 `pages` 断言改成包含：

```python
'P05', 'P06', 'P09', 'P10'
```

并新增断言：

```python
assert report['pages']['P05']['explore_ratio'] == 0.4
assert report['pages']['P05']['top_search_track']['track_id'] == 't9'
assert report['pages']['P06'][0]['keyword'] == 'hello'
assert report['pages']['P09'][0]['period_key'] == '2025-01'
assert report['pages']['P10']['taste_score'] >= 0
assert report['pages']['P10']['summary_label']
```

同时将 `FakeCursor.execute()` 的 marker 表扩展为：

```python
'data_p05_explore_repeat': 'metric_key',
'data_p06_keyword_source_rows': 'text_value',
'data_p09_genre_evolution': 'period_key',
'data_p10_taste_inputs': 'is_new_genre',
```

并更新 `len(cursor.executed)` 期望值。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest tests/python/test_build_year_report.py -q
```

Expected: FAIL，原因是 `build_report_from_dataset_payloads()` 还未组装 P05/P06/P09/P10。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中先补最小页面结构：

```python
p05_rows = dataset_payloads.get('data_p05_explore_repeat') or []
p06_rows = dataset_payloads.get('data_p06_keyword_source_rows') or []
p09_rows = dataset_payloads.get('data_p09_genre_evolution') or []
p10_rows = dataset_payloads.get('data_p10_taste_inputs') or []

p05 = {'explore_ratio': 0, 'repeat_ratio': 0, 'top_search_track': None, 'top_repeat_track': None}
p06 = []
p09 = []
p10 = {'taste_score': 0, 'summary_label': '--', 'summary_text': '--'}
```

并把这四页加入 `pages`。这一步只做最小占位，让测试从“页面不存在”推进到“字段细节不匹配”的下一轮红灯。

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run:

```bash
pytest tests/python/test_build_year_report.py -q
```

Expected: FAIL，但现在应是值不匹配，而不是 `KeyError: 'P05'` 之类页面缺失错误。

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_build_year_report.py scripts/year_report/build_year_report.py
git commit -m "test: add year report batch2 page contracts"
```

---

### Task 3: 实现 P05/P09 查询 SQL

**Files:**
- Modify: `scripts/year_report/year_report_queries.py`
- Test: `tests/python/test_year_report_queries.py`

- [ ] **Step 1: Write the failing test**

在 `tests/python/test_year_report_queries.py` 增加对 SQL 内容的最小断言：

```python
plan = module.build_query_plan(2025)
assert 'entry_source' in plan['data_p05_explore_repeat']['sql']
assert 'first_played_at' in plan['data_p09_genre_evolution']['sql']
assert 'GROUP BY' in plan['data_p09_genre_evolution']['sql']
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest tests/python/test_year_report_queries.py -q
```

Expected: FAIL，因为当前 SQL 还是 placeholder。

- [ ] **Step 3: Write minimal implementation**

把 `scripts/year_report/year_report_queries.py` 中 placeholder SQL 替换成真实聚合：

`data_p05_explore_repeat` 目标结构：

```sql
DECLARE @year int = %s;
{COMMON_BASE_CTE},
track_year_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    COUNT(DISTINCT play_date) AS active_days,
    MAX(CASE WHEN YEAR(first_played_at) = @year THEN 1 ELSE 0 END) AS is_year_new
  FROM base
  GROUP BY track_id
),
search_stats AS (
  SELECT TOP 1
    N'track' AS row_type,
    N'search_top' AS metric_key,
    COUNT(*) AS play_count,
    NULL AS track_count,
    NULL AS active_days,
    NULL AS ratio,
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist
  FROM base
  WHERE entry_source = 'search'
  GROUP BY track_id
  ORDER BY COUNT(*) DESC, MAX(title), track_id
)
SELECT ...
```

要求输出：

- `row_type = 'summary'` 的 explore / repeat 两行
- `row_type = 'track'` 的 `search_top` / `repeat_top` 两行

`data_p09_genre_evolution` 目标结构：

```sql
DECLARE @year int = %s;
{COMMON_BASE_CTE},
first_seen_tracks AS (
  SELECT DISTINCT
    track_id,
    CONVERT(varchar(7), first_played_at, 120) AS period_key,
    TRIM(value) AS genre
  FROM base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(genre, ''), '|', '/'), ',', '/'), '/')
  WHERE YEAR(first_played_at) = @year
    AND LTRIM(RTRIM(value)) <> ''
),
period_stats AS (
  SELECT
    period_key,
    genre,
    COUNT(*) AS new_track_count
  FROM first_seen_tracks
  GROUP BY period_key, genre
),
period_total AS (
  SELECT period_key, SUM(new_track_count) AS total_count
  FROM period_stats
  GROUP BY period_key
)
SELECT
  s.period_key,
  s.genre,
  s.new_track_count,
  CAST(s.new_track_count * 1.0 / NULLIF(t.total_count, 0) AS decimal(10,4)) AS ratio
FROM period_stats s
INNER JOIN period_total t
  ON s.period_key = t.period_key
ORDER BY s.period_key ASC, s.new_track_count DESC, s.genre ASC;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pytest tests/python/test_year_report_queries.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/year_report_queries.py tests/python/test_year_report_queries.py
git commit -m "feat: add sql datasets for report pages p05 and p09"
```

---

### Task 4: 实现 P06/P10 聚合逻辑

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Write the failing test**

在 `tests/python/test_build_year_report.py` 进一步细化断言：

```python
assert report['pages']['P06'][0] == {
    'keyword': 'hello',
    'hit_count': 2,
    'source_type': 'lyric',
    'representative_track': {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A'},
    'representative_snippet': 'hello world hello dream',
}
assert report['pages']['P10']['breadth_score'] > 0
assert report['pages']['P10']['depth_score'] > 0
assert report['pages']['P10']['freshness_score'] > 0
assert report['pages']['P10']['balance_score'] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest tests/python/test_build_year_report.py -q
```

Expected: FAIL，因为当前 `P06/P10` 还是占位实现。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 内新增最小 helper，并在本文件内完成实现，不拆新文件：

```python
import re
from collections import Counter

STOPWORDS = {'the', 'and', 'feat', 'song', '歌词', 'music'}


def _clean_keyword_text(value):
    value = re.sub(r'\[[^\]]*\]', ' ', value or '')
    value = re.sub(r'[_\-./\\]+', ' ', value)
    value = value.lower().strip()
    return value


def _extract_keywords(rows):
    counter = Counter()
    examples = {}
    for row in rows:
        text = _clean_keyword_text(row.get('text_value') or '')
        for token in re.findall(r'[a-zA-Z]{3,}|[\u4e00-\u9fff]{2,}', text):
            if token in STOPWORDS:
                continue
            counter[token] += 1
            examples.setdefault(token, row)
    result = []
    for keyword, hit_count in counter.most_common(8):
        row = examples[keyword]
        result.append({
            'keyword': keyword,
            'hit_count': hit_count,
            'source_type': row.get('source_type'),
            'representative_track': {
                'track_id': row.get('track_id'),
                'title': row.get('title'),
                'artist': row.get('artist'),
            },
            'representative_snippet': _clean_keyword_text(row.get('text_value') or '')[:80].strip(),
        })
    return result
```

再补 `P10` 评分：

```python
def _build_taste_score(rows):
    total_play_count = sum(row.get('play_count', 0) for row in rows) or 1
    genre_count = len([row for row in rows if row.get('genre')])
    new_genre_count = len([row for row in rows if row.get('is_new_genre')])
    top_share = max((row.get('play_count', 0) for row in rows), default=0) / total_play_count
    breadth_score = min(30, genre_count * 8)
    depth_score = min(25, sum(1 for row in rows if row.get('play_count', 0) >= 10) * 8)
    freshness_score = min(20, new_genre_count * 8)
    balance_score = max(0, round((1 - top_share) * 25))
    taste_score = breadth_score + depth_score + freshness_score + balance_score
    summary_label = '持续探索型' if freshness_score >= 10 else '稳定深挖型'
    summary_text = '你保持主偏好的同时，也持续扩展新风格' if freshness_score >= 10 else '你的口味很专一，但在核心曲风里挖得很深'
    return {
        'taste_score': taste_score,
        'breadth_score': breadth_score,
        'depth_score': depth_score,
        'freshness_score': freshness_score,
        'balance_score': balance_score,
        'summary_label': summary_label,
        'summary_text': summary_text,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pytest tests/python/test_build_year_report.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_build_year_report.py
git commit -m "feat: build report pages p06 and p10"
```

---

### Task 5: 完成 P05/P09/P10 页面组装与查询联动

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Modify: `scripts/year_report/year_report_queries.py`
- Test: `tests/python/test_build_year_report.py`
- Test: `tests/python/test_year_report_queries.py`

- [ ] **Step 1: Write the failing test**

补细化断言：

```python
assert report['pages']['P05']['summary_text']
assert report['pages']['P05']['top_repeat_track']['track_id'] == 't8'
assert report['pages']['P09'][0]['top_genre'] == 'J-Pop'
assert report['pages']['P09'][1]['top_genre'] == 'Vocaloid'
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected: FAIL，因为 P05/P09 组装还未完整输出解释字段。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/build_year_report.py` 中：

```python
def _build_p05(rows):
    summary_rows = {row.get('metric_key'): row for row in rows if row.get('row_type') == 'summary'}
    track_rows = {row.get('metric_key'): row for row in rows if row.get('row_type') == 'track'}
    explore_ratio = summary_rows.get('explore', {}).get('ratio', 0) or 0
    repeat_ratio = summary_rows.get('repeat', {}).get('ratio', 0) or 0
    summary_text = '今年你更偏主动探索新歌' if explore_ratio >= repeat_ratio else '今年你更偏反复回听旧爱'
    return {
        'explore_ratio': explore_ratio,
        'repeat_ratio': repeat_ratio,
        'explore_play_count': summary_rows.get('explore', {}).get('play_count', 0),
        'repeat_play_count': summary_rows.get('repeat', {}).get('play_count', 0),
        'search_play_count': summary_rows.get('explore', {}).get('play_count', 0),
        'repeat_active_days': summary_rows.get('repeat', {}).get('active_days', 0),
        'top_search_track': {
            'track_id': track_rows.get('search_top', {}).get('track_id'),
            'title': track_rows.get('search_top', {}).get('title'),
            'artist': track_rows.get('search_top', {}).get('artist'),
            'play_count': track_rows.get('search_top', {}).get('play_count', 0),
        } if track_rows.get('search_top') else None,
        'top_repeat_track': {
            'track_id': track_rows.get('repeat_top', {}).get('track_id'),
            'title': track_rows.get('repeat_top', {}).get('title'),
            'artist': track_rows.get('repeat_top', {}).get('artist'),
            'play_count': track_rows.get('repeat_top', {}).get('play_count', 0),
            'active_days': track_rows.get('repeat_top', {}).get('active_days', 0),
        } if track_rows.get('repeat_top') else None,
        'summary_text': summary_text,
    }


def _build_p09(rows):
    groups = {}
    for row in rows:
        groups.setdefault(row.get('period_key'), []).append(row)
    result = []
    for period_key in sorted(groups):
        items = sorted(groups[period_key], key=lambda item: (-(item.get('new_track_count') or 0), item.get('genre') or ''))
        result.append({
            'period_key': period_key,
            'top_genre': items[0].get('genre') if items else None,
            'genres': items,
            'summary_text': f"{period_key} 你更偏向 {items[0].get('genre')}" if items else None,
        })
    return result
```

并把 P05/P09 页面接到 `pages`。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pytest tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/build_year_report.py scripts/year_report/year_report_queries.py tests/python/test_build_year_report.py tests/python/test_year_report_queries.py
git commit -m "feat: build report pages p05 and p09"
```

---

### Task 6: 补前端 HTML 壳与渲染测试

**Files:**
- Modify: `tests/year-report/year-report-html.test.js`
- Modify: `tools/year-report/show_year_report.html`
- Modify: `tools/year-report/year-report-app.js`
- Test: `tests/year-report/year-report-html.test.js`

- [ ] **Step 1: Write the failing test**

在 `tests/year-report/year-report-html.test.js` 中新增断言：

```javascript
assert.match(html, /data-page="P05"/)
assert.match(html, /data-page="P06"/)
assert.match(html, /data-page="P09"/)
assert.match(html, /data-page="P10"/)
assert.match(appJs, /renderPageP05/)
assert.match(appJs, /renderPageP06/)
assert.match(appJs, /renderPageP09/)
assert.match(appJs, /renderPageP10/)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/year-report/year-report-html.test.js
```

Expected: FAIL，因为 HTML 和 JS 里还没有这四个页面。

- [ ] **Step 3: Write minimal implementation**

先在 `tools/year-report/show_year_report.html` 增加：

```html
<article class="card" data-page="P05"><h2>P05 主动探索 vs 重复所爱</h2><div data-role="content"></div></article>
<article class="card" data-page="P06"><h2>P06 年度听歌关键词</h2><div data-role="content"></div></article>
<article class="card" data-page="P09"><h2>P09 曲风进化历</h2><div data-role="content"></div></article>
<article class="card" data-page="P10"><h2>P10 品味曲风分数</h2><div data-role="content"></div></article>
```

并在 `tools/year-report/year-report-app.js` 先补最小函数：

```javascript
function renderPageP05(page) { return page ? '<div></div>' : '<div class="empty">暂无数据</div>' }
function renderPageP06(page) { return Array.isArray(page) ? '<div></div>' : '<div class="empty">暂无数据</div>' }
function renderPageP09(page) { return Array.isArray(page) ? '<div></div>' : '<div class="empty">暂无数据</div>' }
function renderPageP10(page) { return page ? '<div></div>' : '<div class="empty">暂无数据</div>' }
```

同时接入 `renderers()` 和 `windowScope.YearReportApp`。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/year-report/year-report-html.test.js
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add tests/year-report/year-report-html.test.js tools/year-report/show_year_report.html tools/year-report/year-report-app.js
git commit -m "test: add year report batch2 html shells"
```

---

### Task 7: 完成前端渲染实现

**Files:**
- Modify: `tools/year-report/year-report-app.js`
- Test: `tests/year-report/year-report-html.test.js`
- Test: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Write the failing test**

在 `tests/year-report/year-report-html.test.js` 新增字符串存在断言，确保使用已有组件：

```javascript
assert.match(appJs, /P05 主动探索/)
assert.match(appJs, /关键词/)
assert.match(appJs, /top_genre/)
assert.match(appJs, /taste_score/)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/year-report/year-report-html.test.js
```

Expected: FAIL，因为当前渲染函数只是空壳。

- [ ] **Step 3: Write minimal implementation**

在 `tools/year-report/year-report-app.js` 中实现：

```javascript
function renderPageP05(page) {
  if (!page) return '<div class="empty">暂无数据</div>'
  return `
    <div class="card__eyebrow">Explore vs Repeat</div>
    ${renderMetricGrid([
      { label: '主动探索', value: formatPercent(page.explore_ratio) },
      { label: '重复所爱', value: formatPercent(page.repeat_ratio) },
      { label: '搜索触发', value: `${page.search_play_count ?? 0} 次` },
      { label: '反复心动天数', value: `${page.repeat_active_days ?? 0} 天` },
    ])}
    <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
    ${renderRankList([
      page.top_search_track,
      page.top_repeat_track,
    ].filter(Boolean), (item, index) => ({
      index: String(index + 1),
      title: `${item.title} - ${item.artist}`,
      meta: `播放 ${item.play_count ?? 0} 次`,
      extra: `track_id: ${item.track_id || '--'}`,
    }))}
  `
}
```

```javascript
function renderPageP06(page) {
  if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无数据</div>'
  return `
    <div class="card__eyebrow">Keywords</div>
    ${renderRankList(page, (item, index) => ({
      index: String(index + 1),
      title: item.keyword,
      meta: `${item.hit_count} 次 · ${item.source_type}`,
      extra: `${item.representative_track?.title || '--'} · ${item.representative_snippet || '--'}`,
    }))}
  `
}
```

```javascript
function renderPageP09(page) {
  if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无数据</div>'
  return renderYearGroups(page, 'period_key', items => {
    const group = items[0]
    return `
      <div class="muted">主曲风：${escapeHtml(group.top_genre || '--')}</div>
      ${renderBarChart(group.genres || [], item => ({
        label: item.genre,
        valueRaw: item.new_track_count,
        valueLabel: `${item.new_track_count} 首`,
      }))}
    `
  })
}
```

```javascript
function renderPageP10(page) {
  if (!page) return '<div class="empty">暂无数据</div>'
  return `
    <div class="card__eyebrow">Taste Score</div>
    <div class="stat">${escapeHtml(page.taste_score)}</div>
    ${renderMetricGrid([
      { label: '广度', value: String(page.breadth_score ?? 0) },
      { label: '深度', value: String(page.depth_score ?? 0) },
      { label: '新鲜度', value: String(page.freshness_score ?? 0) },
      { label: '均衡度', value: String(page.balance_score ?? 0) },
    ])}
    <div class="muted">${escapeHtml(page.summary_label || '--')} · ${escapeHtml(page.summary_text || '--')}</div>
  `
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/year-report/year-report-html.test.js
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add tools/year-report/year-report-app.js tests/year-report/year-report-html.test.js
git commit -m "feat: render year report batch2 pages"
```

---

### Task 8: 全量验证与生成真实报告

**Files:**
- Modify: `publish/report_2026_from_db.json`
- Test: `tests/python/test_year_report_queries.py`
- Test: `tests/python/test_build_year_report.py`
- Test: `tests/year-report/year-report-html.test.js`
- Test: `tests/year-report/ods-import-tool.test.js`

- [ ] **Step 1: Run focused Python tests**

Run:

```bash
pytest tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected: PASS。

- [ ] **Step 2: Run full Python tests**

Run:

```bash
pytest tests/python -q
```

Expected: PASS。

- [ ] **Step 3: Run Node tests**

Run:

```bash
node --test tests/year-report/year-report-html.test.js tests/year-report/ods-import-tool.test.js
```

Expected: PASS。

- [ ] **Step 4: Build real report JSON from DB**

Run:

```bash
python scripts/year_report/build_year_report.py --year 2026 --db-url "mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg" --output publish/report_2026_from_db.json --generated-at "2026-04-30T18:28:00+08:00"
```

Expected: exit code 0，并生成包含 `P05/P06/P09/P10` 的 JSON。

- [ ] **Step 5: Sanity check the generated report**

Run:

```bash
python - <<'PY'
import json
from pathlib import Path
p = Path('publish/report_2026_from_db.json')
report = json.loads(p.read_text(encoding='utf-8'))
print(sorted(k for k in report['pages'].keys() if k in ('P05','P06','P09','P10')))
print(report['pages']['P05'])
print(report['pages']['P06'][:3] if isinstance(report['pages']['P06'], list) else report['pages']['P06'])
print(report['pages']['P09'][:2] if isinstance(report['pages']['P09'], list) else report['pages']['P09'])
print(report['pages']['P10'])
PY
```

Expected: 打印四个页面且结构完整。

- [ ] **Step 6: Commit**

```bash
git add scripts/year_report/year_report_queries.py scripts/year_report/build_year_report.py tools/year-report/show_year_report.html tools/year-report/year-report-app.js tests/python/test_year_report_queries.py tests/python/test_build_year_report.py tests/year-report/year-report-html.test.js publish/report_2026_from_db.json
git commit -m "feat: add year report batch2 pages"
```

---

## Self-Review

### Spec coverage

- `P05`：Task 1 / 2 / 3 / 5 / 7 覆盖
- `P06`：Task 1 / 2 / 4 / 7 覆盖
- `P09`：Task 1 / 2 / 3 / 5 / 7 覆盖
- `P10`：Task 1 / 2 / 4 / 7 覆盖
- 错误处理与空态：Task 4 / 7 覆盖
- 全量验证与真实 JSON：Task 8 覆盖

### Placeholder scan

- 未使用 TBD / TODO / implement later
- 每个任务都给了具体文件、命令和最小代码方向

### Type consistency

- 数据集名统一为：`data_p05_explore_repeat` / `data_p06_keyword_source_rows` / `data_p09_genre_evolution` / `data_p10_taste_inputs`
- 页面名统一为：`P05` / `P06` / `P09` / `P10`
- 关键字段统一为：
  - `P05.explore_ratio/repeat_ratio/top_search_track/top_repeat_track`
  - `P06.keyword/hit_count/source_type/representative_track/representative_snippet`
  - `P09.period_key/top_genre/genres/summary_text`
  - `P10.taste_score/breadth_score/depth_score/freshness_score/balance_score/summary_label/summary_text`
