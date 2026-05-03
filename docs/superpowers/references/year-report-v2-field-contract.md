# Year Report V2 Field Contract

## 说明

本文档记录当前已落到代码里的页面顺序与最小字段 contract。当前阶段已经完成：

1. 年报骨架顺序固化；
2. `P20` 深夜页聚合；
3. `P21` 历年最晚记录按年份聚合；
4. `P23/P24` 年度专辑冠军与专辑榜聚合；
5. `P31` 元数据覆盖率与封面颜色摘要聚合；
6. `L01` 曲库总览指标聚合；
7. `L02` 年度新增分析聚合；
8. `L04` 全曲库 / 年新增歌手双榜聚合；
9. `L03` 主曲风 / 加权曲风双口径聚合；
10. `P32` 年度总结四格拼装。

## 当前已确认顺序片段

以下页面在骨架阶段必须按此顺序出现：

- `P20`
- `P21`
- `P23`
- `P24`
- `P31`
- `L01`
- `L04`
- `L02`
- `L03`
- `P32`

---

## P20 深夜听歌

- `page_id`: `P20`
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
- `representative_tracks`: `[]`
  - `track_title`
  - `artist_display`
  - `late_night_play_total`
  - `latest_time`
  - `cover_path`

当前聚合口径：
- 从 `play_history` 中筛选 `year == report.year` 的记录；
- 仅统计带有 `night_sort_minute` 的记录；
- `latest_night_record` 取本年度 `night_sort_minute` 最大的一条；
- `late_night_track_total` 当前按深夜歌曲去重数统计；
- `representative_tracks` 按“深夜播放次数降序 -> 最晚时刻降序 -> 歌曲名升序”排序；
- 若本年没有深夜记录，则相关字段降级为 `None / 0 / []`。

---

## P21 历年最晚记录

- `page_id`: `P21`
- `title`
- `year`
- `summary_text`
- `latest_night_history`: `[]`
  - `year`
  - `latest_time`
  - `track_title`
  - `artist_display`
  - `cover_path`
  - `night_sort_minute`
  - `is_peak_record`
- `peak_record_year`

当前聚合口径：
- 从 `play_history` 中按 `year` 分组；
- 每年取 `night_sort_minute` 最大的一条作为当年最晚记录；
- 全部年份中 `night_sort_minute` 最大的记录标记为 `is_peak_record = true`；
- `peak_record_year` 指向该峰值记录所在年份。

---

## P23 年度之最专辑

- `page_id`: `P23`
- `title`
- `year`
- `summary_text`
- `top_album`
  - `rank`
  - `album_display`
  - `artist_display`
  - `play_total`
  - `track_total`
  - `active_days`
  - `listened_sec`
  - `representative_track_title`
  - `cover_path`

当前聚合口径：
- 从 `play_history` 中筛选 `year == report.year` 的记录；
- 过滤无效专辑：空值、`unknown`、`未知`、`未识别`、`other`、`single`、`单曲`、`散曲`、`未收录专辑`；
- 以 `album_display` 作为当前最小聚合键；
- 排序规则为“播放次数降序 -> 歌曲去重数降序 -> 活跃天数降序 -> 收听秒数降序 -> 专辑名升序”；
- `representative_track_title` 取该专辑下播放最高歌曲。

---

## P24 年度最爱专辑榜

- `page_id`: `P24`
- `title`
- `year`
- `summary_text`
- `album_ranking`: `[]`
  - `rank`
  - `album_display`
  - `artist_display`
  - `play_total`
  - `track_total`
  - `active_days`
  - `listened_sec`
  - `representative_track_title`
  - `cover_path`

当前聚合口径：
- 完全复用 `P23` 的专辑聚合结果；
- 当前阶段默认输出 Top 10；
- 排序规则与 `P23` 保持一致，避免冠军页与榜单页出现口径分叉。

---

## P31 元数据完成度与封面颜色

- `page_id`: `P31`
- `title`
- `year`
- `summary_text`
- `coverage`
  - `lyrics_ratio`
  - `cover_ratio`
  - `genre_ratio`
  - `album_ratio`
  - `artist_ratio`
  - `duration_ratio`
  - `credit_ratio`
- `cover_color_summary`
  - `counted_track_total`
  - `excluded_track_total`
  - `top_colors`: `[]`
    - `color_hex`
    - `track_count`
    - `representative_track_title`
    - `representative_artist_display`
    - `representative_cover_path`

当前聚合口径：
- `coverage` 基于 `library_tracks` 总条数计算；
- `credit_ratio` 目前按 `composer` 或 `lyricist` 任一字段存在即计入；
- `cover_color_summary` 仅统计 `cover_color` 有值的歌曲；
- 没有封面颜色的歌曲计入 `excluded_track_total`，暂不纳入颜色 Top 排名。

---

## L01 歌曲库总览

- `page_id`: `L01`
- `title`
- `year`
- `summary_text`
- `metrics`
  - `track_total`
  - `artist_total`
  - `album_total`
  - `duration_total_sec`
  - `new_track_total`
  - `new_artist_total`
  - `new_album_total`
- `coverage`
  - `lyrics_ratio`
  - `cover_ratio`
  - `genre_ratio`
  - `album_ratio`
  - `artist_ratio`
  - `duration_ratio`
  - `credit_ratio`

当前聚合口径：
- `track_total` 直接取 `library_tracks` 条数；
- `artist_total` / `album_total` 基于非空值去重；
- `new_*` 当前基于 `first_added_year == report.year` 统计。

---

## L02 年度新增分析

- `page_id`: `L02`
- `title`
- `year`
- `summary_text`
- `growth_metrics`
  - `new_track_total`
  - `new_artist_total`
  - `new_album_total`
- `monthly_growth`: `[]`
  - `month`
  - `new_track_total`
  - `new_artist_total`
  - `new_album_total`

当前聚合口径：
- 仅统计 `library_tracks` 中 `first_added_year == report.year` 的歌曲；
- `new_artist_total` 与 `new_album_total` 基于非空值去重；
- `monthly_growth` 仅在新增歌曲都具备 `first_added_month` 时输出；
- 若缺月度字段，则 `growth_metrics` 正常返回、`monthly_growth` 返回空数组。

---

## L04 歌曲库歌手榜

- `page_id`: `L04`
- `title`
- `year`
- `summary_text`
- `library_artist_ranking`: `[]`
  - `artist_display`
  - `track_total`
  - `album_total`
  - `top_track_title`
- `new_artist_ranking`: `[]`
  - `artist_display`
  - `new_track_total`
  - `new_album_total`
  - `highlight_tag`

当前聚合口径：
- `library_artist_ranking`：按全曲库非空歌手分组，统计歌曲数与专辑去重数；
- `new_artist_ranking`：按 `first_added_year == report.year` 的歌曲分组，统计新增歌曲数与新增专辑数；
- 两个榜单都会过滤空歌手，避免未知值进入榜单；
- 当前排序均为“歌曲数降序 -> 专辑数降序 -> 歌手名升序”。

---

## P32 年度总结四格

- `page_id`: `P32`
- `title`
- `year`
- `summary_text`
- `summary_cards`: `[]`
  - `card_id`
  - `headline`
  - `value`
  - `support_text`

当前拼装口径：
- `latest-night`：复用 `P20.latest_night_record`；
- `top-album`：复用 `P23.top_album`；
- `top-new-artist`：复用 `L04.new_artist_ranking[0]`；
- `library-structure`：复用 `L03.weighted_genre_distribution[0]`；
- 某张卡源数据缺失时允许跳过，但页面仍返回其余可用卡片。
