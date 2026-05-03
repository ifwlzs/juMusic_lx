# Year Report V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `2026-05-01-year-report-v2-design.md` 中定义的年报主线页与歌曲库专题页落地为可生成、可测试、可前端展示的结构化报告数据。

**Architecture:** 先稳定实体口径层（歌曲 / 歌手 / 专辑 / 覆盖率 / 新增判定），再补报告构建层（P / L 页面数据），最后同步前端渲染与回归测试。实现优先复用现有 Python 年报构建脚本、数据库维表与前端页面注册逻辑，避免重新发明一套统计口径。

**Tech Stack:** Python（年报构建脚本）、Node.js（前端年报渲染与测试）、SQL Server / 维表入库链路、现有 year-report HTML/JS 测试

---

## 一、文件职责与改动范围

### 预计修改文件

- `scripts/year_report/build_year_report.py`
  - 年报数据总装配
  - P / L 页构建函数
  - 摘要文案与坏数据降级策略

- `scripts/music_etl/` 下相关入库 / 清洗脚本
  - 歌手映射表接入
  - 歌曲维表口径补齐
  - 首次入库时间 / 新增判定依赖字段整理

- `tools/year-report/year-report-app.js`
  - 页面注册顺序
  - L01~L03 渲染
  - P31 / P23 / P24 / P25 等展示补齐

- `tests/year-report/*.test.js`
  - 前端页面渲染断言
  - 排序与摘要降级断言

- `tests/python/*year*` 或 `tests/python/*report*`
  - Python 年报口径回归测试

- 数据库迁移 / SQL 文档（如已有位置）
  - 歌手别名映射表
  - 歌曲维表补充字段说明

### 预计新增文件

- `docs/superpowers/references/year-report-v2-field-contract.md`
  - 可选：列出 P / L 页面 JSON contract

- 新测试文件（按实际拆分）
  - `tests/year-report/year-report-library-pages.test.js`
  - `tests/python/test_year_report_v2_contract.py`

---

## 二、任务分解

### Task 1: 固化年报字段 contract

**Files:**
- Create: `docs/superpowers/references/year-report-v2-field-contract.md`
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_v2_contract.py`

- [ ] **Step 1: 写出 P / L 页最小字段 contract**

在 `docs/superpowers/references/year-report-v2-field-contract.md` 中列出至少以下页面字段：

```markdown
# Year Report V2 Field Contract

## P23 年度之最专辑
- page_id: `P23`
- title
- summary_text
- top_album: { album_display, album_artist_display, play_count, active_days, listened_sec, top_song_title, cover_path }

## P25 年度歌曲
- page_id: `P25`
- title
- summary_text
- song_of_year: { title_display, artist_display, album_display, play_count, active_days, listened_sec, score, peak_month, cover_path }

## L01 歌曲库总览
- page_id: `L01`
- title
- summary_text
- metrics: { track_total, artist_total, album_total, duration_total_sec, new_track_total, ... }
- coverage: { lyrics_coverage_ratio, cover_coverage_ratio, genre_coverage_ratio, album_coverage_ratio, duration_coverage_ratio, artist_coverage_ratio }
```

- [ ] **Step 2: 先写 Python contract 测试**

```python
from scripts.year_report.build_year_report import build_year_report

def test_year_report_v2_contains_library_pages(sample_report_input):
    report = build_year_report(sample_report_input)
    page_ids = [page["page_id"] for page in report["pages"]]
    assert "L01" in page_ids
    assert "L02" in page_ids
    assert "L03" in page_ids
```

- [ ] **Step 3: 运行测试确认先失败**

Run: `pytest tests/python/test_year_report_v2_contract.py -q`
Expected: FAIL，提示缺少新页面或字段。

- [ ] **Step 4: 在构建脚本里补最小 contract 占位输出**

```python
{
    "page_id": "L01",
    "title": "歌曲库总览",
    "summary_text": "",
    "metrics": {},
    "coverage": {},
}
```

- [ ] **Step 5: 再跑测试确认通过**

Run: `pytest tests/python/test_year_report_v2_contract.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add docs/superpowers/references/year-report-v2-field-contract.md tests/python/test_year_report_v2_contract.py scripts/year_report/build_year_report.py
git commit -m "test(year-report): add v2 page contract coverage"
```

---

### Task 2: 落地歌手映射与归一输入层

**Files:**
- Modify: `scripts/music_etl/*`
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_artist_norm.py`

- [ ] **Step 1: 写歌手归一测试样例**

```python
def test_artist_aliases_merge_to_single_norm():
    rows = [
        {"artist_raw": "洛天依office"},
        {"artist_raw": "洛天依"},
        {"artist_raw": "初音ミク"},
        {"artist_raw": "hatsunemiku"},
    ]
    result = normalize_artists(rows)
    assert result[0]["artist_norm"] == "洛天依"
    assert result[1]["artist_norm"] == "洛天依"
    assert result[2]["artist_norm"] == "初音未来"
    assert result[3]["artist_norm"] == "初音未来"
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `pytest tests/python/test_year_report_artist_norm.py -q`
Expected: FAIL

- [ ] **Step 3: 接入数据库映射表优先级**

实现顺序：

```python
artist_norm = (
    alias_map_hit
    or cleaned_track_artist_norm
    or metadata_artist
    or filename_artist
    or folder_artist
    or producer_fallback
)
```

- [ ] **Step 4: 增加 `合唱` / `多歌手` / `未知歌手` 排除逻辑单测**

```python
def test_group_artists_do_not_become_top_single_artist():
    top_artist = pick_top_single_artist([...])
    assert top_artist["artist_norm"] != "合唱"
```

- [ ] **Step 5: 跑测试**

Run: `pytest tests/python/test_year_report_artist_norm.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add scripts/music_etl scripts/year_report/build_year_report.py tests/python/test_year_report_artist_norm.py
git commit -m "feat(year-report): normalize artists with alias priority"
```

---

### Task 3: 落地专辑归一与未知专辑排除

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_album_rules.py`

- [ ] **Step 1: 写未知专辑排除测试**

```python
def test_unknown_albums_are_excluded_from_album_rankings():
    pages = build_album_pages([
        {"album_norm": "unknown", "play_count": 999},
        {"album_norm": "专辑A", "play_count": 20},
    ])
    assert pages["P23"]["top_album"]["album_display"] == "专辑A"
```

- [ ] **Step 2: 写单曲 / 散曲不进专辑冠军测试**

```python
def test_single_bucket_does_not_win_album_of_year():
    ...
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pytest tests/python/test_year_report_album_rules.py -q`
Expected: FAIL

- [ ] **Step 4: 实现专辑过滤函数**

```python
INVALID_ALBUMS = {"", "unknown", "未知", "未识别", "other"}
SINGLE_ALBUMS = {"single", "单曲", "未收录专辑", "散曲"}

def is_rankable_album(album_norm: str) -> bool:
    ...
```

- [ ] **Step 5: 实现 P23 / P24 排序**

排序：

```python
sorted(albums, key=lambda x: (-x["play_count"], -x["active_days"], -x["listened_sec"]))
```

- [ ] **Step 6: 跑测试**

Run: `pytest tests/python/test_year_report_album_rules.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_year_report_album_rules.py
git commit -m "feat(year-report): exclude unknown albums from rankings"
```

---

### Task 4: 落地歌曲综合分与年度歌曲组

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_song_rules.py`

- [ ] **Step 1: 写年度歌曲综合分测试**

```python
def test_song_of_year_prefers_consistent_companion_over_short_spike():
    songs = [
        {"title": "A", "play_count": 40, "active_days": 25, "listened_sec": 7200},
        {"title": "B", "play_count": 45, "active_days": 5, "listened_sec": 5400},
    ]
    top_song = pick_song_of_year(songs)
    assert top_song["title_display"] == "A"
```

- [ ] **Step 2: 写反复聆听指数测试**

```python
def test_repeat_page_prefers_high_repeat_index():
    ...
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pytest tests/python/test_year_report_song_rules.py -q`
Expected: FAIL

- [ ] **Step 4: 实现综合分与重复指数**

```python
def song_score(play_count, active_days, listened_sec):
    listened_hours = listened_sec / 3600
    return play_count * 0.55 + active_days * 0.30 + listened_hours * 0.15


def repeat_index(play_count, active_days):
    return play_count / max(active_days, 1)
```

- [ ] **Step 5: 生成 P22 / P25 / P26 数据结构**

至少保证输出：

```python
{
    "page_id": "P25",
    "song_of_year": {
        "title_display": ...,
        "artist_display": ...,
        "play_count": ...,
        "active_days": ...,
        "score": ...,
    }
}
```

- [ ] **Step 6: 跑测试**

Run: `pytest tests/python/test_year_report_song_rules.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_year_report_song_rules.py
git commit -m "feat(year-report): add song-of-year and repeat-song scoring"
```

---

### Task 5: 落地歌曲库专题页 L01~L03

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_library_pages.py`

- [ ] **Step 1: 写 L01 / L02 / L03 测试**

```python
def test_library_summary_excludes_unknown_album_from_album_total():
    report = build_year_report(sample_input)
    l01 = find_page(report, "L01")
    assert l01["metrics"]["album_total"] == 3


def test_library_new_analysis_marks_single_peak_month():
    l02 = find_page(report, "L02")
    assert l02["peak_new_month"] == "2026-04"


def test_library_structure_summary_uses_recognized_genre_not_unknown():
    l03 = find_page(report, "L03")
    assert "未识别" not in l03["summary_text"][:20]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/python/test_year_report_library_pages.py -q`
Expected: FAIL

- [ ] **Step 3: 实现 L01**

输出：
- 歌曲 / 歌手 / 专辑总数
- 总时长
- 新增歌曲 / 歌手 / 专辑数
- 覆盖率字段
- 规模型摘要文案

- [ ] **Step 4: 实现 L02**

输出：
- 新增歌曲 / 歌手 / 专辑数
- 月度新增趋势
- 单一峰值月份
- 新增 Top 歌手 / 专辑 / 语种 / 曲风
- 扩库型摘要文案

- [ ] **Step 5: 实现 L03**

输出：
- 语种分布
- 时长分布
- 曲风分布
- 避免未识别主叙事的摘要

- [ ] **Step 6: 跑测试**

Run: `pytest tests/python/test_year_report_library_pages.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_year_report_library_pages.py
git commit -m "feat(year-report): add library summary and growth pages"
```

---

### Task 6: 落地坏数据降级文案与摘要规则

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python/test_year_report_summary_rules.py`

- [ ] **Step 1: 写未识别 / 覆盖率降级测试**

```python
def test_genre_summary_prefers_recognized_genre_when_unknown_dominates():
    ...


def test_coverage_warning_is_appended_when_album_coverage_is_low():
    ...
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/python/test_year_report_summary_rules.py -q`
Expected: FAIL

- [ ] **Step 3: 提炼通用摘要 helper**

```python
def append_coverage_warning(summary, field_name, ratio, threshold=0.6):
    ...


def pick_recognized_label_first(items, unknown_aliases):
    ...
```

- [ ] **Step 4: 应用到 P08/P09/P10/L03/P31 等页面**

要求：
- 未识别项不抢主语
- 覆盖率不足时统一追加说明

- [ ] **Step 5: 跑测试**

Run: `pytest tests/python/test_year_report_summary_rules.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add scripts/year_report/build_year_report.py tests/python/test_year_report_summary_rules.py
git commit -m "feat(year-report): unify fallback summary rules"
```

---

### Task 7: 同步前端页面顺序与渲染

**Files:**
- Modify: `tools/year-report/year-report-app.js`
- Test: `tests/year-report/year-report-html.test.js`

- [ ] **Step 1: 写前端页面注册顺序测试**

```javascript
test('year report renders library pages after album pages and before summary', () => {
  const pageIds = getRenderedPageIds(sampleReport)
  expect(pageIds).toContain('L01')
  expect(pageIds.indexOf('P24')).toBeLessThan(pageIds.indexOf('L01'))
  expect(pageIds.indexOf('L03')).toBeLessThan(pageIds.indexOf('P31'))
})
```

- [ ] **Step 2: 写 L01~L03 渲染测试**

```javascript
test('renderPageL01 shows metrics and coverage blocks', () => {
  ...
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test tests/year-report/year-report-html.test.js`
Expected: FAIL

- [ ] **Step 4: 在前端注册新页面与新顺序**

至少新增：

```javascript
case 'L01':
case 'L02':
case 'L03':
```

并更新页面排序与渲染函数映射。

- [ ] **Step 5: 补渲染函数**

- `renderPageL01()`
- `renderPageL02()`
- `renderPageL03()`

- [ ] **Step 6: 跑测试**

Run: `node --test tests/year-report/year-report-html.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add tools/year-report/year-report-app.js tests/year-report/year-report-html.test.js
git commit -m "feat(year-report): render v2 library pages"
```

---

### Task 8: 真数复核与全链路回归

**Files:**
- Modify: `scripts/year_report/build_year_report.py`
- Test: `tests/python`
- Test: `tests/year-report`

- [ ] **Step 1: 跑 Python 年报相关测试**

Run: `pytest tests/python -q`
Expected: PASS

- [ ] **Step 2: 跑 year-report 前端测试**

Run: `node --test tests/year-report/year-report-html.test.js tests/year-report/ods-import-tool.test.js`
Expected: PASS

- [ ] **Step 3: 生成真实年报 JSON**

Run:

```bash
python scripts/year_report/build_year_report.py --year 2026 --db-url "mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg" --output publish/report_2026_from_db.json --generated-at "2026-05-01T12:50:00+08:00"
```

Expected: 生成成功

- [ ] **Step 4: 复核关键页面**

重点检查：
- `P23`：未知专辑未进榜
- `P16/P27/P29`：洛天依别名已归一
- `P25`：年度歌曲不是纯短期刷歌劫持
- `L01`：专辑总数未把未知专辑算进去
- `L02`：峰值月份只强调 1 个月
- `L03`：未识别曲风不抢摘��
- `P31`：覆盖率文案可读

- [ ] **Step 5: 收尾提交**

```bash
git add scripts/year_report/build_year_report.py tools/year-report/year-report-app.js tests docs
git commit -m "feat(year-report): deliver v2 report structure and scoring rules"
```

---

## 三、执行建议

推荐实现顺序：

1. Task 1 ~ 3：先稳定 contract、歌手、专辑；
2. Task 4 ~ 6：落地歌曲组、专题页、摘要规则；
3. Task 7：补前端显示；
4. Task 8：跑真数与全链路回归。

## 四、注意事项

- 年报优先吃维表稳定字段，不要在报告层重复发明归一规则；
- 未识别 / 未知项允许统计，但默认不做页面主角；
- 专辑页与歌曲页的“未知专辑”口径不同：
  - 专辑页排除；
  - 歌曲页允许存在；
- `合唱` 目录只允许从文件名补歌手，不允许目录名直接认单歌手；
- 新增页与主线页要严格区分“播放行为”口径和“歌库快照”口径。
