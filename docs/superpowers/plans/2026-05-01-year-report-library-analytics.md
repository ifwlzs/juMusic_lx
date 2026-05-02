# Year Report Music Library Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new year-report pages backed by `ods_jumusic_music_info` to show music library overview and library structure, including genre distribution.

**Architecture:** Extend the SQL query plan with two new dataset queries that read only from `dbo.ods_jumusic_music_info`, map them into report payloads, then render two new pages in the static year-report app. Keep the scope intentionally small: one page for library overview metrics and one page for structure distributions (format, duration buckets, genre).

**Tech Stack:** Python, SQL Server (pymssql query strings), static browser JS renderer, pytest, Node test runner

---

## File Responsibilities

- `scripts/year_report/year_report_queries.py`
  - Define two new datasets for library overview and library structure.
  - Keep dataset shape declarations and row-to-payload mapping in one place.
- `scripts/year_report/build_year_report.py`
  - Pull the new dataset payloads into the final report `pages` map.
- `tests/python/test_year_report_queries.py`
  - Lock query-plan coverage, dataset shapes, and payload mapping for the new library datasets.
- `tests/python/test_build_year_report.py`
  - Lock final page presence and report contract for the new pages.
- `tools/year-report/year-report-app.js`
  - Render the two new pages.
- `tests/year-report/year-report-html.test.js`
  - Confirm the HTML shell / browser helpers still expose the required sections after adding new pages.

### Task 1: Add failing Python tests for library dataset contracts

**Files:**
- Modify: `tests/python/test_year_report_queries.py`
- Modify: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Write the failing dataset-shape and mapping tests**

```python
# tests/python/test_year_report_queries.py
assert 'data_lib_overview' in module.SUPPORTED_DATASETS
assert 'data_lib_structure' in module.SUPPORTED_DATASETS
assert module.DATASET_SHAPES['data_lib_overview'] == 'one'
assert module.DATASET_SHAPES['data_lib_structure'] == 'many'

lib_overview = module.map_rows_to_dataset_payload('data_lib_overview', [{
    'track_count': 100,
    'artist_count': 40,
    'album_count': 30,
    'genre_count': 12,
    'total_duration_sec': 18000,
    'avg_duration_sec': 180,
}])
lib_structure = module.map_rows_to_dataset_payload('data_lib_structure', [
    {'row_type': 'format', 'bucket_key': 'flac', 'bucket_label': 'FLAC', 'item_count': 60, 'ratio': 0.6},
    {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 50, 'ratio': 0.5},
    {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 20, 'ratio': 0.2},
])

assert lib_overview['track_count'] == 100
assert lib_structure[0]['row_type'] == 'format'
assert lib_structure[2]['bucket_label'] == 'Vocaloid'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/python/test_year_report_queries.py -q -k "data_lib_overview or data_lib_structure"`
Expected: FAIL because the datasets do not exist yet.

- [ ] **Step 3: Write the failing report-page contract tests**

```python
# tests/python/test_build_year_report.py
payloads = sample_dataset_payloads()
payloads['data_lib_overview'] = {
    'track_count': 100,
    'artist_count': 40,
    'album_count': 30,
    'genre_count': 12,
    'total_duration_sec': 18000,
    'avg_duration_sec': 180,
}
payloads['data_lib_structure'] = [
    {'row_type': 'format', 'bucket_key': 'flac', 'bucket_label': 'FLAC', 'item_count': 60, 'ratio': 0.6},
    {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 50, 'ratio': 0.5},
    {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 20, 'ratio': 0.2},
]
report = module.build_report_from_dataset_payloads(year=2025, dataset_payloads=payloads, generated_at='2026-04-30T15:00:00+08:00')
assert report['pages']['P04']['track_count'] == 100
assert report['pages']['P07']['genre_distribution'][0]['bucket_label'] == 'Vocaloid'
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pytest tests/python/test_build_year_report.py -q -k "P04 or P07 or library"`
Expected: FAIL because the report does not emit these pages yet.

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_queries.py tests/python/test_build_year_report.py
git commit -m "test: add year report library analytics contracts"
```

### Task 2: Implement SQL datasets and payload mapping

**Files:**
- Modify: `scripts/year_report/year_report_queries.py`
- Test: `tests/python/test_year_report_queries.py`

- [ ] **Step 1: Add dataset names and shapes**

```python
SUPPORTED_DATASETS = (
    'data_p01_summary',
    'data_p02_overview',
    'data_p03_explore',
    'data_lib_overview',
    'data_p05_explore_repeat',
    'data_p06_keyword_source_rows',
    'data_lib_structure',
    ...
)

DATASET_SHAPES = {
    'data_p01_summary': 'one',
    'data_p02_overview': 'one',
    'data_p03_explore': 'one',
    'data_lib_overview': 'one',
    'data_p05_explore_repeat': 'many',
    'data_p06_keyword_source_rows': 'many',
    'data_lib_structure': 'many',
    ...
}
```

- [ ] **Step 2: Add overview SQL**

```sql
'data_lib_overview': f"""
SELECT
  COUNT(*) AS track_count,
  COUNT(DISTINCT NULLIF(artist, '')) AS artist_count,
  COUNT(DISTINCT NULLIF(album, '')) AS album_count,
  COUNT(DISTINCT NULLIF(genre, '')) AS genre_count,
  SUM(COALESCE(duration_sec, 0)) AS total_duration_sec,
  AVG(CAST(COALESCE(duration_sec, 0) AS decimal(18,6))) AS avg_duration_sec
FROM dbo.ods_jumusic_music_info
WHERE scan_status = 'SUCCESS';
""".strip(),
```

- [ ] **Step 3: Add structure SQL**

```sql
'data_lib_structure': f"""
WITH base AS (
  SELECT
    LOWER(COALESCE(NULLIF(file_ext, ''), 'unknown')) AS file_ext,
    COALESCE(duration_sec, 0) AS duration_sec,
    COALESCE(NULLIF(genre, ''), N'未识别') AS genre
  FROM dbo.ods_jumusic_music_info
  WHERE scan_status = 'SUCCESS'
),
all_counts AS (
  SELECT COUNT(*) AS total_count FROM base
),
format_rows AS (
  SELECT
    'format' AS row_type,
    file_ext AS bucket_key,
    UPPER(file_ext) AS bucket_label,
    COUNT(*) AS item_count
  FROM base
  GROUP BY file_ext
),
duration_rows AS (
  SELECT
    'duration' AS row_type,
    bucket_key,
    bucket_label,
    COUNT(*) AS item_count
  FROM (
    SELECT CASE
      WHEN duration_sec < 120 THEN 'lt_2'
      WHEN duration_sec < 240 THEN '2_4'
      WHEN duration_sec < 360 THEN '4_6'
      ELSE '6_plus'
    END AS bucket_key,
    CASE
      WHEN duration_sec < 120 THEN N'2 分钟以下'
      WHEN duration_sec < 240 THEN N'2-4 分钟'
      WHEN duration_sec < 360 THEN N'4-6 分钟'
      ELSE N'6 分钟以上'
    END AS bucket_label
    FROM base
  ) t
  GROUP BY bucket_key, bucket_label
),
genre_rows AS (
  SELECT TOP 10
    'genre' AS row_type,
    genre AS bucket_key,
    genre AS bucket_label,
    COUNT(*) AS item_count
  FROM base
  GROUP BY genre
  ORDER BY COUNT(*) DESC, genre
)
SELECT row_type, bucket_key, bucket_label, item_count,
       CAST(item_count * 1.0 / NULLIF((SELECT total_count FROM all_counts), 0) AS decimal(18,6)) AS ratio
FROM format_rows
UNION ALL
SELECT row_type, bucket_key, bucket_label, item_count,
       CAST(item_count * 1.0 / NULLIF((SELECT total_count FROM all_counts), 0) AS decimal(18,6)) AS ratio
FROM duration_rows
UNION ALL
SELECT row_type, bucket_key, bucket_label, item_count,
       CAST(item_count * 1.0 / NULLIF((SELECT total_count FROM all_counts), 0) AS decimal(18,6)) AS ratio
FROM genre_rows;
""".strip(),
```

- [ ] **Step 4: Update payload mapping and run tests**

Run: `pytest tests/python/test_year_report_queries.py -q`
Expected: PASS with the new datasets included in coverage and mapping tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/year_report_queries.py tests/python/test_year_report_queries.py
git commit -m "feat: add library analytics datasets"
```

### Task 3: Emit new report pages from Python builder

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Pull the new payloads into the builder**

```python
p04 = dataset_payloads.get('data_lib_overview')
p07_rows = dataset_payloads.get('data_lib_structure') or []
```

- [ ] **Step 2: Build a grouped structure payload for P07**

```python
def _build_library_structure(rows):
    grouped = {'format_distribution': [], 'duration_distribution': [], 'genre_distribution': []}
    for row in rows:
        item = {
            'bucket_key': row.get('bucket_key'),
            'bucket_label': row.get('bucket_label'),
            'item_count': _safe_number(row.get('item_count'), 0),
            'ratio': _safe_number(row.get('ratio'), 0.0),
        }
        if row.get('row_type') == 'format':
            grouped['format_distribution'].append(item)
        elif row.get('row_type') == 'duration':
            grouped['duration_distribution'].append(item)
        elif row.get('row_type') == 'genre':
            grouped['genre_distribution'].append(item)
    return grouped
```

- [ ] **Step 3: Publish the new pages**

```python
pages = {
    'P01': p01,
    'P02': p02,
    'P03': p03,
    'P04': p04,
    'P05': p05,
    'P06': p06,
    'P07': _build_library_structure(p07_rows),
    ...
}
```

- [ ] **Step 4: Run report builder tests**

Run: `pytest tests/python/test_build_year_report.py -q`
Expected: PASS with `P04` and `P07` present and shaped correctly.

- [ ] **Step 5: Commit**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_build_year_report.py
git commit -m "feat: emit library analytics pages"
```

### Task 4: Render the new pages in the browser app

**Files:**
- Modify: `tools/year-report/year-report-app.js`
- Modify: `tests/year-report/year-report-html.test.js`

- [ ] **Step 1: Add the new renderers**

```javascript
function renderPageP04(page) {
  if (!page) return '<div class="empty">暂无曲库总览</div>'
  return `
    <div class="card__eyebrow">Library Overview</div>
    ${renderMetricGrid([
      { label: '歌曲总数', value: `${page.track_count ?? 0} 首` },
      { label: '歌手数', value: `${page.artist_count ?? 0}` },
      { label: '专辑数', value: `${page.album_count ?? 0}` },
      { label: '曲风数', value: `${page.genre_count ?? 0}` },
      { label: '总时长', value: formatDuration(page.total_duration_sec) },
      { label: '平均时长', value: formatDuration(page.avg_duration_sec) },
    ])}
  `
}

function renderPageP07(page) {
  if (!page) return '<div class="empty">暂无曲库结构</div>'
  return `
    <div class="card__eyebrow">Library Structure</div>
    <h3>文件格式</h3>
    ${renderBarChart(page.format_distribution || [], item => ({ label: item.bucket_label, valueRaw: item.item_count, valueLabel: `${item.item_count} 首` }))}
    <h3>时长区间</h3>
    ${renderBarChart(page.duration_distribution || [], item => ({ label: item.bucket_label, valueRaw: item.item_count, valueLabel: `${item.item_count} 首` }))}
    <h3>曲风分布</h3>
    ${renderBarChart(page.genre_distribution || [], item => ({ label: item.bucket_label, valueRaw: item.item_count, valueLabel: `${item.item_count} 首` }))}
  `
}
```

- [ ] **Step 2: Register the renderers and test exposure**

Run: `node --test tests/year-report/year-report-html.test.js`
Expected: PASS with the new page renderer helpers exposed.

- [ ] **Step 3: Commit**

```bash
git add tools/year-report/year-report-app.js tests/year-report/year-report-html.test.js
git commit -m "feat: render library analytics pages"
```

### Task 5: Run end-to-end verification with a real report build

**Files:**
- Modify: `publish/report_2026_from_db.json` (generated artifact)

- [ ] **Step 1: Run Python and browser tests**

Run: `pytest tests/python -q`
Expected: PASS

Run: `node --test tests/year-report/year-report-html.test.js tests/year-report/ods-import-tool.test.js`
Expected: PASS

- [ ] **Step 2: Generate a real report**

Run: `python scripts/year_report/build_year_report.py --year 2026 --db-url "mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg" --output publish/report_2026_from_db.json --generated-at "2026-05-01T12:50:00+08:00"`
Expected: Exit code 0 and JSON containing `P04` and `P07`.

- [ ] **Step 3: Spot-check the new pages**

```python
import json
from pathlib import Path
report = json.loads(Path('publish/report_2026_from_db.json').read_text(encoding='utf-8'))
assert 'P04' in report['pages']
assert 'P07' in report['pages']
assert report['pages']['P04']['track_count'] >= 1
assert isinstance(report['pages']['P07']['genre_distribution'], list)
```

- [ ] **Step 4: Commit**

```bash
git add publish/report_2026_from_db.json
git commit -m "chore: verify library analytics report output"
```
