# Essentia Genre Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Essentia 曲风结果从单字符串字段升级为“raw/path/parent/child/depth”结构化字段，并让 ODS 回灌与年报分析都优先使用拆层结果。

**Architecture:** 继续沿用当前 Linux 推理 + Windows 标准化 + SQL Server 回灌的链路，不改模型本体，只在标准化、ODS 表结构、入库更新和年报查询消费层完成升级。保留 `genre_essentia_label` 作为兼容字段，但新增 `raw/path/parent/child/depth` 作为后续分析主口径。

**Tech Stack:** Python 3.10/3.12、pymssql、SQL Server、pytest、Essentia 外挂 JSON 回灌链路

---

## File Structure

### Existing files to modify
- `scripts/music_etl/load_music_info.py`
  - ODS 表结构、列注释、genre inference 解析、行构建与回灌字段入口
- `tests/python/test_load_music_info.py`
  - 覆盖拆层解析、建表 SQL、回灌字段写入、兼容逻辑
- `scripts/year_report/year_report_queries.py`
  - 年报曲风相关查询从旧字段切换为 `parent/child/path` 优先
- `tests/python/test_year_report_queries.py`
  - 验证 SQL 合同切换到结构化字段
- `scripts/year_report/build_year_report.py`
  - 如有 Python 侧依赖单字段展示，切到结构化字段优先并保留兼容回退
- `tests/python/test_build_year_report.py`
  - 验证年报聚合输出的曲风口径未退化

### New/updated artifacts
- `docs/superpowers/specs/2026-05-02-essentia-genre-schema-design.md`
  - 已完成设计文档
- `docs/superpowers/plans/2026-05-02-essentia-genre-schema.md`
  - 本实施计划

---

### Task 1: 在 music ETL 层引入曲风拆层解析函数

**Files:**
- Modify: `scripts/music_etl/load_music_info.py`
- Test: `tests/python/test_load_music_info.py`

- [ ] **Step 1: Write the failing tests**

在 `tests/python/test_load_music_info.py` 增加以下测试：

```python
def test_split_genre_label_parses_two_level_path():
    module = load_module()

    result = module.split_genre_essentia_label('Pop---J-pop')

    assert result == {
        'genre_essentia_raw_label': 'Pop---J-pop',
        'genre_essentia_path': 'Pop---J-pop',
        'genre_essentia_parent': 'Pop',
        'genre_essentia_child': 'J-pop',
        'genre_essentia_depth': 2,
        'genre_essentia_label': 'J-pop',
    }


def test_split_genre_label_parses_single_level_path():
    module = load_module()

    result = module.split_genre_essentia_label('Vocaloid')

    assert result == {
        'genre_essentia_raw_label': 'Vocaloid',
        'genre_essentia_path': 'Vocaloid',
        'genre_essentia_parent': 'Vocaloid',
        'genre_essentia_child': None,
        'genre_essentia_depth': 1,
        'genre_essentia_label': 'Vocaloid',
    }


def test_split_genre_label_trims_empty_segments_and_handles_blank():
    module = load_module()

    assert module.split_genre_essentia_label(' Pop ---  J-pop ') == {
        'genre_essentia_raw_label': 'Pop ---  J-pop',
        'genre_essentia_path': 'Pop---J-pop',
        'genre_essentia_parent': 'Pop',
        'genre_essentia_child': 'J-pop',
        'genre_essentia_depth': 2,
        'genre_essentia_label': 'J-pop',
    }
    assert module.split_genre_essentia_label('   ') == {
        'genre_essentia_raw_label': None,
        'genre_essentia_path': None,
        'genre_essentia_parent': None,
        'genre_essentia_child': None,
        'genre_essentia_depth': None,
        'genre_essentia_label': None,
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- FAIL，提示 `split_genre_essentia_label` 不存在或返回结构不匹配。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/music_etl/load_music_info.py` 增加一个纯函数，紧邻 `load_genre_inference_map()` 或 `build_music_row()` 之前：

```python
def split_genre_essentia_label(label):
    raw_label = None if label is None else str(label).strip()
    if not raw_label:
        return {
            'genre_essentia_raw_label': None,
            'genre_essentia_path': None,
            'genre_essentia_parent': None,
            'genre_essentia_child': None,
            'genre_essentia_depth': None,
            'genre_essentia_label': None,
        }

    parts = [part.strip() for part in raw_label.split('---') if part and part.strip()]
    if not parts:
        return {
            'genre_essentia_raw_label': None,
            'genre_essentia_path': None,
            'genre_essentia_parent': None,
            'genre_essentia_child': None,
            'genre_essentia_depth': None,
            'genre_essentia_label': None,
        }

    path = '---'.join(parts)
    parent = parts[0] if len(parts) >= 1 else None
    child = parts[1] if len(parts) >= 2 else None
    display_label = child or parent or path

    return {
        'genre_essentia_raw_label': raw_label,
        'genre_essentia_path': path,
        'genre_essentia_parent': parent,
        'genre_essentia_child': child,
        'genre_essentia_depth': len(parts),
        'genre_essentia_label': display_label,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- 新增解析测试 PASS
- 旧测试不回归

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_load_music_info.py scripts/music_etl/load_music_info.py
git commit -m "feat: add structured essentia genre label parser"
```

### Task 2: 扩展 ODS 表结构与回灌字段

**Files:**
- Modify: `scripts/music_etl/load_music_info.py`
- Test: `tests/python/test_load_music_info.py`

- [ ] **Step 1: Write the failing tests**

在 `tests/python/test_load_music_info.py` 中补充针对建表 SQL / upsert 列集合 / 行构建的断言：

```python
def test_warehouse_columns_include_structured_essentia_genre_fields():
    module = load_module()

    assert 'genre_essentia_raw_label' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_path' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_parent' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_child' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_depth' in module.WAREHOUSE_COLUMNS


def test_build_music_row_expands_structured_essentia_genre_fields():
    from datetime import datetime
    module = load_module()
    now = datetime(2026, 5, 2, 10, 0, 0)

    row = module.build_music_row(
        file_info={
            'root_path': 'Z:/Music',
            'file_path': 'Z:/Music/a.mp3',
            'file_name': 'a.mp3',
            'file_ext': '.mp3',
            'file_size': 1,
            'file_mtime': now,
            'file_md5': 'x',
            'is_readable': True,
        },
        metadata={
            'title': 'a', 'artist': 'b', 'album': None, 'album_artist': None,
            'track_no': None, 'disc_no': None, 'genre': None, 'year': None,
            'duration_sec': 1.0, 'bitrate': None, 'sample_rate': None, 'channels': None,
            'scan_status': 'SUCCESS', 'scan_error': None,
        },
        batch_id='batch-1',
        now=now,
        genre_inference={
            'genre_essentia_label': 'Pop---J-pop',
            'genre_essentia_confidence': 0.91,
            'genre_essentia_model': 'essentia-test',
            'genre_essentia_source': 'linux-vm',
            'genre_essentia_inferred_at': now,
        },
    )

    assert row['genre_essentia_raw_label'] == 'Pop---J-pop'
    assert row['genre_essentia_path'] == 'Pop---J-pop'
    assert row['genre_essentia_parent'] == 'Pop'
    assert row['genre_essentia_child'] == 'J-pop'
    assert row['genre_essentia_depth'] == 2
    assert row['genre_essentia_label'] == 'J-pop'
```

同时补断言检查 `ensure_table()` 相关 SQL 中出现新增列名。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- FAIL，提示新增列不在 `WAREHOUSE_COLUMNS` 或 `build_music_row` 未写这些字段。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/music_etl/load_music_info.py` 中完成以下修改：

1. 扩展 `WAREHOUSE_COLUMNS`：

```python
'genre_essentia_label',
'genre_essentia_raw_label',
'genre_essentia_path',
'genre_essentia_parent',
'genre_essentia_child',
'genre_essentia_depth',
'genre_essentia_confidence',
'genre_essentia_model',
'genre_essentia_source',
'genre_essentia_inferred_at',
```

2. 在建表 SQL 与 `ALTER TABLE` 里加入：

```sql
genre_essentia_raw_label nvarchar(255) null,
genre_essentia_path nvarchar(255) null,
genre_essentia_parent nvarchar(100) null,
genre_essentia_child nvarchar(100) null,
genre_essentia_depth int null,
```

3. 在 `COMMENT_SQLS` 中为 5 个新增列补列注释。

4. 在 `build_music_row()` 中，不再直接把传入的 `genre_essentia_label` 塞到行里，而是：

```python
row['genre_essentia_label'] = None
row['genre_essentia_raw_label'] = None
row['genre_essentia_path'] = None
row['genre_essentia_parent'] = None
row['genre_essentia_child'] = None
row['genre_essentia_depth'] = None

if genre_inference:
    genre_parts = split_genre_essentia_label(
        genre_inference.get('genre_essentia_raw_label')
        or genre_inference.get('genre_essentia_path')
        or genre_inference.get('genre_essentia_label')
    )
    row.update(genre_parts)
    row['genre_essentia_confidence'] = genre_inference.get('genre_essentia_confidence')
    row['genre_essentia_model'] = genre_inference.get('genre_essentia_model')
    row['genre_essentia_source'] = genre_inference.get('genre_essentia_source')
    row['genre_essentia_inferred_at'] = genre_inference.get('genre_essentia_inferred_at')
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- 新增字段与建表测试 PASS
- 旧回灌测试仍 PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_load_music_info.py scripts/music_etl/load_music_info.py
git commit -m "feat: store structured essentia genre fields in music ods"
```

### Task 3: 扩展标准化 JSON 兼容结构化字段

**Files:**
- Modify: `scripts/music_etl/load_music_info.py`
- Test: `tests/python/test_load_music_info.py`

- [ ] **Step 1: Write the failing tests**

为 `load_genre_inference_map()` 增加兼容断言：

```python
def test_load_genre_inference_map_keeps_structured_essentia_fields():
    module = load_module()
    path = tmp_path / 'genre.json'
    path.write_text(json.dumps([
        {
            'file_path': 'Z:/Music/a.mp3',
            'genre_essentia_raw_label': 'Pop---J-pop',
            'genre_essentia_path': 'Pop---J-pop',
            'genre_essentia_parent': 'Pop',
            'genre_essentia_child': 'J-pop',
            'genre_essentia_depth': 2,
            'genre_essentia_label': 'J-pop',
            'genre_essentia_confidence': 0.88,
        }
    ], ensure_ascii=False), encoding='utf-8')

    result = module.load_genre_inference_map(str(path))

    assert result['Z:/Music/a.mp3']['genre_essentia_parent'] == 'Pop'
    assert result['Z:/Music/a.mp3']['genre_essentia_child'] == 'J-pop'
    assert result['Z:/Music/a.mp3']['genre_essentia_depth'] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- FAIL 或至少缺少结构化字段覆盖。

- [ ] **Step 3: Write minimal implementation**

只需确保 `load_genre_inference_map()` 继续整项透传，不做字段裁剪；如果当前测试已经证明透传，就只补测试，不额外改实现。若需要，可补一个帮助函数，把旧结构 JSON 自动扩成新结构：

```python
def normalize_genre_inference_item(item):
    if not item:
        return {}
    result = dict(item)
    parts = split_genre_essentia_label(
        result.get('genre_essentia_raw_label')
        or result.get('genre_essentia_path')
        or result.get('genre_essentia_label')
    )
    for key, value in parts.items():
        result[key] = result.get(key) or value
    return result
```

然后 `load_genre_inference_map()` 中改为：

```python
result[str(file_path)] = normalize_genre_inference_item(item)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest tests/python/test_load_music_info.py -q
```

Expected:
- 结构化 JSON 兼容测试 PASS

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_load_music_info.py scripts/music_etl/load_music_info.py
git commit -m "feat: normalize structured essentia inference payloads"
```

### Task 4: 把年报曲风查询切到结构化字段优先

**Files:**
- Modify: `scripts/year_report/year_report_queries.py`
- Test: `tests/python/test_year_report_queries.py`
- Test: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Write the failing tests**

在 `tests/python/test_year_report_queries.py` 中增加针对曲风查询 SQL 的合同断言：

```python
def test_genre_queries_prefer_structured_essentia_parent_child_path_fields():
    module = load_module()
    plan = module.build_query_plan(2025)

    p08_sql = plan['data_p08_genres']['sql']
    p09_sql = plan['data_p09_genre_evolution']['sql']
    p10_sql = plan['data_p10_taste_inputs']['sql']
    l03_sql = plan['data_lib_structure']['sql']

    assert 'genre_essentia_parent' in p08_sql or 'genre_essentia_child' in p08_sql or 'genre_essentia_path' in p08_sql
    assert 'genre_essentia_parent' in p09_sql or 'genre_essentia_child' in p09_sql or 'genre_essentia_path' in p09_sql
    assert 'genre_essentia_parent' in p10_sql or 'genre_essentia_child' in p10_sql or 'genre_essentia_path' in p10_sql
    assert 'genre_essentia_parent' in l03_sql or 'genre_essentia_child' in l03_sql or 'genre_essentia_path' in l03_sql
```

如果 `tests/python/test_build_year_report.py` 里有基于 genre label 的聚合断言，再补一条表示“优先 child、其次 parent、最后兼容 label”的数据组装测试。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected:
- FAIL，提示 SQL 仍只依赖旧字段。

- [ ] **Step 3: Write minimal implementation**

在 `scripts/year_report/year_report_queries.py` 中，为所有曲风相关 SQL 统一引入一个稳定表达式，例如：

```sql
COALESCE(
    NULLIF(m.genre_essentia_child, ''),
    NULLIF(m.genre_essentia_parent, ''),
    NULLIF(m.genre_essentia_label, ''),
    NULLIF(m.genre, ''),
    N'未识别'
)
```

并按用途分别替换：

1. 需要大类统计的地方优先 `genre_essentia_parent`
2. 需要细类展示的地方优先 `genre_essentia_child`
3. 需要最细粒度榜单的地方优先 `genre_essentia_path`

保持旧字段 `genre` 仍作为最后回退，避免未识别样本全部丢失。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected:
- 曲风查询合同测试 PASS
- 年报构建测试无回归

- [ ] **Step 5: Commit**

```bash
git add tests/python/test_year_report_queries.py tests/python/test_build_year_report.py scripts/year_report/year_report_queries.py scripts/year_report/build_year_report.py
git commit -m "feat: prefer structured essentia genre fields in year report"
```

### Task 5: 回填当前已入库的 100 首样本

**Files:**
- Modify: `scripts/music_etl/load_music_info.py`（如需要补脚本入口）
- Verify: `tmp/essentia/normalized_predictions_100_windows.json`
- Verify: SQL Server `dbo.ods_jumusic_music_info`

- [ ] **Step 1: Write a focused verification test or script**

如果不新增自动化测试，至少写一个一次性 Python 验证脚本片段，检查 100 首样本在标准化后都能生成结构化字段：

```python
import json
from pathlib import Path
from scripts.music_etl.load_music_info import normalize_genre_inference_item

items = json.loads(Path('tmp/essentia/normalized_predictions_100_windows.json').read_text(encoding='utf-8'))
normalized = [normalize_genre_inference_item(item) for item in items]
assert all('genre_essentia_parent' in item for item in normalized)
assert all('genre_essentia_path' in item for item in normalized)
```

- [ ] **Step 2: Run the verification to establish current gap**

Run the verification snippet or a targeted pytest case and confirm the current JSON / DB rows do not yet have the structured columns populated.

- [ ] **Step 3: Implement the backfill update**

使用现有回灌文件 `tmp/essentia/normalized_predictions_100_windows.json`，通过 `normalize_genre_inference_item()` 扩成带结构化字段的 JSON，然后执行 SQL 更新：

```python
UPDATE dbo.ods_jumusic_music_info
SET genre_essentia_label = %s,
    genre_essentia_raw_label = %s,
    genre_essentia_path = %s,
    genre_essentia_parent = %s,
    genre_essentia_child = %s,
    genre_essentia_depth = %s,
    genre_essentia_confidence = %s,
    genre_essentia_model = %s,
    genre_essentia_source = %s,
    genre_essentia_inferred_at = %s,
    etl_updated_at = SYSDATETIME()
WHERE file_path = %s
```

- [ ] **Step 4: Run verification after backfill**

Run:

```sql
SELECT COUNT(*)
FROM dbo.ods_jumusic_music_info
WHERE genre_essentia_parent IS NOT NULL
```

Expected:
- 至少当前 100 首为非空

再抽样：

```sql
SELECT TOP 10 file_path, genre_essentia_raw_label, genre_essentia_parent, genre_essentia_child, genre_essentia_depth
FROM dbo.ods_jumusic_music_info
WHERE genre_essentia_parent IS NOT NULL
ORDER BY etl_updated_at DESC
```

- [ ] **Step 5: Commit**

```bash
git add scripts/music_etl/load_music_info.py tests/python/test_load_music_info.py tmp/essentia/normalized_predictions_100_windows.json
git commit -m "feat: backfill structured essentia genre fields for seeded samples"
```

### Task 6: Full regression verification

**Files:**
- Verify: `tests/python/test_load_music_info.py`
- Verify: `tests/python/test_year_report_queries.py`
- Verify: `tests/python/test_build_year_report.py`

- [ ] **Step 1: Run focused Python tests**

Run:

```bash
pytest tests/python/test_load_music_info.py tests/python/test_year_report_queries.py tests/python/test_build_year_report.py -q
```

Expected:
- 全部 PASS

- [ ] **Step 2: Run broader Python regression**

Run:

```bash
pytest tests/python -q
```

Expected:
- 全量 Python 测试 PASS

- [ ] **Step 3: Rebuild one real report payload if query shape changed**

Run:

```bash
$env:JUMUSIC_DB_URL='mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg'
python scripts/year_report/build_year_report.py --year 2026 --db-url $env:JUMUSIC_DB_URL --output publish/report_2026_from_db.json --generated-at "2026-05-02T12:00:00+08:00"
```

Expected:
- 成功生成 JSON
- 曲风相关页面未报错，且可读字段存在

- [ ] **Step 4: Review resulting DB rows and report excerpts**

至少确认：

1. `genre_essentia_parent` 有值
2. `genre_essentia_child` 有值
3. 年报曲风页面不再只依赖 `genre_essentia_label`

- [ ] **Step 5: Commit**

```bash
git add scripts/music_etl/load_music_info.py scripts/year_report/year_report_queries.py scripts/year_report/build_year_report.py tests/python/test_load_music_info.py tests/python/test_year_report_queries.py tests/python/test_build_year_report.py docs/superpowers/plans/2026-05-02-essentia-genre-schema.md
git commit -m "feat: adopt structured essentia genre schema across ods and reports"
```
