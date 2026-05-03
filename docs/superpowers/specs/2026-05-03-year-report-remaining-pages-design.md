# 年度报告剩余 5 页数据聚合设计

日期：2026-05-03  
状态：待评审

## 1. 目标

本设计用于补齐当前年报骨架中仍处于占位或半占位状态的 5 个页面：

- `P20` 深夜听歌
- `P23` 年度之最专辑
- `P24` 年度最爱专辑榜
- `L02` 年度新增分析
- `P32` 年度总结四格

本阶段只补**稳定的数据字段 contract + 最小可用聚合逻辑 + 自动化测试**，不处理前端布局与视觉稿。

---

## 2. 设计目标与边界

### 2.1 目标

1. 让上述 5 页都具备稳定输出字段；
2. 让这些字段可以直接被后续前端布局消费；
3. 让聚合逻辑尽量复用已有页面结果，避免重复口径；
4. 对坏数据、空数据、缺月度字段等情况给出可预测降级。

### 2.2 非目标

本阶段不处理：

1. 页面视觉层重排；
2. 动态文案润色到最终上线版本；
3. 复杂推荐算法或情绪分析；
4. 新增数据库表结构。

---

## 3. 总体方案

采用“**先补最小可用聚合，再复用到总结页**”的方案：

1. `P20 / P23 / P24 / L02` 各自产出独立页面数据；
2. `P32` 不发明新的复杂统计，而是优先复用前面页面结果；
3. 所有新页面都先保证：
   - 字段稳定；
   - 空值可降级；
   - 测试可覆盖。

推荐原因：

- 能最快把年报从“半骨架”推进到“整份可接前端”；
- 后续页面顺序再调、布局再改时，数据层不需要返工；
- 总结页只做拼装，风险最低。

---

## 4. 输入数据口径

### 4.1 `play_history`

用于：

- `P20` 深夜页；
- `P23/P24` 年度专辑聚合；
- `P32` 汇总时刻与年度最爱专辑卡片。

当前假定可用字段优先级：

- `year`
- `night_sort_minute`
- `latest_time`
- `track_title`
- `artist_display`
- `album_display`
- `cover_path`
- `play_count`（若已有聚合值则直接使用）
- `play_total`（作为 `play_count` 兼容别名）
- `listened_sec`
- `active_days`

如单条 `play_history` 仍是明细而非聚合，也允许按歌曲/专辑重新聚合。

### 4.2 `library_tracks`

用于：

- `L02` 年度新增分析；
- `P32` 汇总歌手 / 曲库结构卡片。

当前假定可用字段：

- `track_id`
- `track_title`
- `artist_display`
- `album_display`
- `first_added_year`
- `first_added_month`
- `primary_genre`
- `cover_color`

---

## 5. 页面设计

## 5.1 `P20` 深夜听歌

### 输出字段

- `page_id`
- `title`
- `year`
- `summary_text`
- `latest_night_record`
  - `latest_time`
  - `track_title`
  - `artist_display`
  - `cover_path`
  - `night_sort_minute`
- `late_night_total`
- `late_night_track_total`
- `representative_tracks`
  - `track_title`
  - `artist_display`
  - `late_night_play_total`
  - `latest_time`
  - `cover_path`

### 聚合规则

1. 只看 `play_history` 中 `year == report.year` 的记录；
2. 仅统计存在 `night_sort_minute` 的记录；
3. `latest_night_record` 取 `night_sort_minute` 最大的一条；
4. `late_night_total` 取有效夜间记录总条数；
5. `late_night_track_total` 取夜间涉及歌曲去重数；
6. `representative_tracks` 按歌曲聚合夜间播放次数，排序规则：
   - `late_night_play_total DESC`
   - `latest_time DESC`
   - `track_title ASC`

### 降级规则

- 若本年无深夜记录：
  - `latest_night_record = None`
  - `late_night_total = 0`
  - `late_night_track_total = 0`
  - `representative_tracks = []`

---

## 5.2 `P23` 年度之最专辑

### 输出字段

- `page_id`
- `title`
- `year`
- `summary_text`
- `top_album`
  - `album_display`
  - `artist_display`
  - `play_total`
  - `track_total`
  - `active_days`
  - `listened_sec`
  - `representative_track_title`
  - `cover_path`

### 聚合规则

1. 只看 `play_history` 中 `year == report.year` 的记录；
2. 过滤无效专辑：
   - 空值
   - 纯空白
   - `unknown`
   - `未知`
   - `未识别`
   - `other`
   - `single`
   - `单曲`
   - `散曲`
   - `未收录专辑`
3. 以 `album_display` 为当前最小聚合键；
4. 聚合得到：
   - `play_total`
   - `track_total`（歌曲去重数）
   - `active_days`
   - `listened_sec`
5. 排序规则：
   - `play_total DESC`
   - `track_total DESC`
   - `active_days DESC`
   - `listened_sec DESC`
   - `album_display ASC`
6. 第 1 名输出到 `top_album`；
7. `representative_track_title` 取该专辑下播放最高歌曲。

### 降级规则

- 若无有效专辑：`top_album = None`

---

## 5.3 `P24` 年度最爱专辑榜

### 输出字段

- `page_id`
- `title`
- `year`
- `summary_text`
- `album_ranking`
  - `rank`
  - `album_display`
  - `artist_display`
  - `play_total`
  - `track_total`
  - `active_days`
  - `listened_sec`
  - `representative_track_title`
  - `cover_path`

### 聚合规则

1. 完全复用 `P23` 的专辑聚合结果；
2. 排序规则与 `P23` 一致；
3. 输出 TopN，当前骨架阶段默认 `Top 10`；
4. `P23.top_album` 直接取 `P24.album_ranking[0]` 的同口径结果，避免两套排序分叉。

### 降级规则

- 若无有效专辑：`album_ranking = []`

---

## 5.4 `L02` 年度新增分析

### 输出字段

- `page_id`
- `title`
- `year`
- `summary_text`
- `growth_metrics`
  - `new_track_total`
  - `new_artist_total`
  - `new_album_total`
- `monthly_growth`
  - `month`
  - `new_track_total`
  - `new_artist_total`
  - `new_album_total`

### 聚合规则

1. 只看 `library_tracks` 中 `first_added_year == report.year` 的记录；
2. `new_track_total`：新增歌曲条数；
3. `new_artist_total`：新增歌曲中的非空歌手去重数；
4. `new_album_total`：新增歌曲中的非空专辑去重数；
5. `monthly_growth` 仅在 `first_added_month` 可用时输出；
6. 月度字段排序按 `month ASC`。

### 降级规则

- 若没有新增歌曲：
  - `growth_metrics` 全部置 0；
  - `monthly_growth = []`
- 若有新增歌曲但缺少月度字段：
  - `growth_metrics` 正常输出；
  - `monthly_growth = []`

---

## 5.5 `P32` 年度总结四格

### 输出字段

- `page_id`
- `title`
- `year`
- `summary_text`
- `summary_cards`
  - `card_id`
  - `headline`
  - `value`
  - `support_text`

### 卡片来源

`P32` 不自行做重聚合，优先复用前序页面结果：

1. `latest-night`
   - 来源：`P21` 或 `P20`
   - 内容：本年最晚时刻 / 历年峰值夜晚
2. `top-album`
   - 来源：`P23`
   - 内容：年度之最专辑
3. `top-new-artist`
   - 来源：`L04.new_artist_ranking`
   - 内容：今年新增歌曲最多的歌手
4. `library-structure`
   - 来源：`L03.weighted_genre_distribution` 或 `P31.cover_color_summary`
   - 内容：曲库最显著结构特征

### 拼装规则

1. 优先固定输出 4 张卡；
2. 某张卡源数据缺失时，允许跳过该卡；
3. 最少保留 1 张卡；
4. `summary_text` 先根据已有卡片数量与主题拼成基础总结，不追求最终修辞。

---

## 6. 共享辅助函数设计

为避免逻辑散落，建议在 `build_year_report.py` 中新增以下辅助函数：

- `_filter_year_rows(...)`
- `_is_valid_album_name(...)`
- `_aggregate_late_night_tracks(...)`
- `_aggregate_album_ranking(...)`
- `_build_p20(...)` 扩展真实聚合
- `_build_p23(...)` 扩展真实聚合
- `_build_p24(...)` 扩展真实聚合
- `_build_l02(...)` 扩展真实聚合
- `_build_p32(...)` 扩展汇总拼装

原则：

- 每个函数只做一类聚合；
- `P23/P24` 共用同一个专辑聚合函数；
- `P32` 只拼装已有结果，不直接扫描原始输入。

---

## 7. 错误处理与空值策略

1. 缺字段时不抛异常，统一按空值降级；
2. 无法识别专辑名时不入专辑榜；
3. 空歌手不参与新增歌手去重；
4. `summary_text` 即使没有任何主数据，也要输出基础兜底文案；
5. 所有列表字段默认输出 `[]`，不输出 `None`。

---

## 8. 测试策略

本阶段测试全部落在：

- `tests/python/test_year_report_build.py`

新增测试至少覆盖：

1. `P20`：
   - 能取本年最晚深夜记录；
   - 能统计夜间记录数与歌曲去重数；
2. `P23`：
   - 能排除未知/散曲类专辑；
   - 能正确选出年度冠军专辑；
3. `P24`：
   - 榜单排序与 `P23` 保持一致；
4. `L02`：
   - 能统计新增歌曲/歌手/专辑；
   - 缺 `first_added_month` 时月度数组为空；
5. `P32`：
   - 能从已有页面结果拼出总结卡片；
   - 源数据部分缺失时仍能输出可用卡片。

---

## 9. 实施顺序建议

建议按以下顺序实现：

1. 先写 `P23/P24` 测试与聚合函数；
2. 再写 `P20`；
3. 再写 `L02`；
4. 最后用前序页面结果拼 `P32`；
5. 最后补文档 contract 与回归测试。

推荐这样排的原因：

- `P23/P24` 共用逻辑最多，先做性价比最高；
- `P32` 依赖前面页面结果，放最后最稳；
- `L02` 与播放主线耦合较低，适合独立补齐。

---

## 10. 验收标准

当以下条件全部满足时，本阶段视为完成：

1. `build_year_report.py` 能为 `P20/P23/P24/L02/P32` 输出稳定字段；
2. 新增测试全部通过；
3. 原有 `P21/P31/L01/L04/L03` 测试不回归失败；
4. 文档 contract 与实现保持一致；
5. 前端即使暂未重布局，也能读到完整的骨架数据。
