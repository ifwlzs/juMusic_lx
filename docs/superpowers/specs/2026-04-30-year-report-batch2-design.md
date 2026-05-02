# 年报 MVP 第二批页面设计（P05 / P06 / P09 / P10）

日期：2026-04-30  
状态：已确认，待写实施计划

## 概述

在现有年报 MVP 已落地 `P01/P02/P03/P08/P12-P32` 多个页面基础上，继续补齐第二批更偏“画像解释”的页面：

1. `P05` 主动探索 vs 重复所爱
2. `P06` 年度听歌关键词
3. `P09` 曲风进化历
4. `P10` 品味曲风分数

这四页的共同目标，不是简单再做播放次数榜单，而是把“你这一年是怎么听歌的”“你的口味怎么变化的”解释出来。

其中：

- `P05 / P09` 适合以 SQL 作为主要口径来源
- `P06 / P10` 更适合先由 Python 聚合层完成 MVP 计算，再输出给 HTML 展示

这样既能保持后续迁移到帆软 / 数据集模式时的可迁移性，也能在当前阶段快速得到可读、可调的结果。

## 目标

1. 补齐 4 个年报页面的数据与展示。
2. 让这 4 页基于当前 ODS + 播放事实表即可产出，不依赖在线接口。
3. 保持“数据库可查 + Python 可组装 + HTML 可预览”的主链路一致。
4. 让页面输出更偏“可解释结果”，而不是只给数字。
5. 尽量复用现有 `build_year_report.py / year_report_queries.py / year-report-app.js` 结构，不拆新链路。

## 非目标

1. 本轮不做词云图片生成。
2. 本轮不做复杂 NLP 模型或外部 API 关键词抽取。
3. 本轮不做严格学术意义上的曲风嵌入/聚类分析。
4. 本轮不把 `P06/P10` 直接下推成纯 SQL 版最终实现。
5. 本轮不改帆软数据集接法，只先保证 Python + HTML 结果稳定。

## 页面设计

### P05 主动探索 vs 重复所爱

#### 口径

采用已确认方案：

- **主动探索**：
  1. 播放入口为 `search`
  2. 或该歌曲为“当年首次听到”
- **重复所爱**：
  1. 不是当年首次听到
  2. 且该歌曲当年播放次数 `>= 2`

#### 输出字段

至少包括：

1. `explore_ratio`
2. `repeat_ratio`
3. `explore_play_count`
4. `repeat_play_count`
5. `search_play_count`
6. `top_search_track`
7. `repeat_active_days`
8. `top_repeat_track`

#### 展示形式

1. 两张对比指标卡：主动探索 / 重复所爱
2. 一段总结文案：
   - 更偏主动找歌
   - 或更偏反复回听
3. 两个代表项：
   - 搜索最多歌曲
   - 反复心动代表歌曲

---

### P06 年度听歌关键词

#### 文本源优先级

采用已确认方案：

1. 歌词
2. 标题
3. 文件名兜底

#### MVP 清洗策略

按顺序处理：

1. 统一大小写与空白符
2. 去掉时间标签，如 LRC 的 `[mm:ss.xx]`
3. 去掉纯符号、纯数字、过短 token
4. 去掉常见停用词
5. 对标题 / 文件名做基础切分
6. 合并同一歌曲多次播放带来的重复命中

#### 输出字段

至少包括：

1. `keyword`
2. `hit_count`
3. `source_type`（lyric/title/file_name）
4. `representative_track`
5. `representative_snippet`

页面主结果建议输出 Top 5 ~ Top 8。

#### 展示形式

1. 顶部显示 1~3 个主关键词
2. 下方显示关键词榜单
3. 每个关键词带：
   - 词频
   - 代表歌曲
   - 命中片段

#### 实现边界

MVP 阶段由 Python 聚合层完成关键词抽取与排序；后续如果要完全迁往 SQL / 帆软，可再拆分为：

- 预处理表
- 停用词表
- 关键词事实表

---

### P09 曲风进化历

#### 口径

采用“歌曲首次进入你生活的时间”作为观察轴，不直接按播放量看，而是按首次接触看偏好演化。

核心逻辑：

1. 取歌曲 `first_played_at`
2. 将歌曲归到首次出现月份 / 年份
3. 统计该时间段首次接触歌曲的曲风分布

#### 输出字段

至少包括：

1. `period_key`（如 `2026-01`）
2. `genre`
3. `new_track_count`
4. `ratio`
5. `period_top_genre`

#### 展示形式

1. 先给阶段列表
2. 每个阶段展示 Top genre + 分布
3. 前端先用分组列表 / 条形图表示

#### 解释文案

根据阶段主曲风生成一句话总结，例如：

- 年初你更容易被二次元 / Vocaloid 吸引
- 年中开始向 J-Pop 扩散
- 年末舞曲和电子感明显增强

MVP 阶段文案允许是模板化文案。

---

### P10 品味曲风分数

#### 设计原则

不做黑盒评分，做可解释评分。

#### 评分维度

总分 `0-100`，由 4 个子项组成：

1. **广度分**：听过多少曲风
2. **深度分**：除 Top1 曲风外，其余曲风是否也有稳定消费
3. **新鲜度分**：当年新增曲风占比
4. **均衡度分**：是否被单一曲风过度垄断

#### 输出字段

至少包括：

1. `taste_score`
2. `breadth_score`
3. `depth_score`
4. `freshness_score`
5. `balance_score`
6. `summary_label`
7. `summary_text`

#### 展示形式

1. 总分大卡
2. 四项子分指标卡
3. 一段解释文案

#### 文案示例

- 你的口味很专一，但在核心曲风里挖得很深
- 你保持主偏好的同时，也持续扩展新风格
- 你的听歌风格分布均衡，探索欲明显

MVP 阶段由 Python 根据模板规则生成文案。

## 数据流设计

### SQL 主导

优先由 `year_report_queries.py` 直接产出的页面：

1. `P05`
2. `P09`

原因：

- 指标基于播放事实和首次播放时间
- 适合在 MSSQL 中按年聚合
- 后续迁移到帆软最顺

### Python 聚合主导

优先由 `build_year_report.py` 进一步计算的页面：

1. `P06`
2. `P10`

原因：

- 文本清洗、关键词抽取更适合 Python
- 评分逻辑与模板文案更适合 Python
- 现阶段更容易迭代口径

## 组件与代码改动范围

### 后端查询层

文件：`scripts/year_report/year_report_queries.py`

新增数据集建议：

1. `data_p05_explore_repeat`
2. `data_p06_keyword_source_rows`
3. `data_p09_genre_evolution`
4. `data_p10_taste_inputs`

其中：

- `data_p06_keyword_source_rows` 返回关键词原始文本明细
- `data_p10_taste_inputs` 返回曲风分布与新曲风指标输入

### 报告组装层

文件：`scripts/year_report/build_year_report.py`

新增：

1. `P05` 组装逻辑
2. `P06` 文本抽取与关键词聚合
3. `P09` 阶段曲风演化组装
4. `P10` 评分与总结文案逻辑
5. `P32` 视情况追加引用字段（仅当四格总结有必要复用）

### 前端页面层

文件：

1. `tools/year-report/show_year_report.html`
2. `tools/year-report/year-report-app.js`

新增页面：

1. `P05`
2. `P06`
3. `P09`
4. `P10`

前端展示优先复用现有组件：

- `renderMetricGrid`
- `renderRankList`
- `renderBarChart`
- `renderYearGroups`

必要时增加轻量 helper，但不大改整体结构。

## 错误处理

1. 某页无数据时，页面显示“暂无数据”，而不是报错。
2. `P06` 若歌词缺失，则自动降级到标题 / 文件名。
3. `P09/P10` 若曲风覆盖不足，明确显示“基于已识别曲风计算”。
4. 对极少量文本或异常 token，直接丢弃，不阻塞整页生成。

## 测试策略

### Python

新增 / 扩展：

1. `tests/python/test_year_report_queries.py`
   - 数据集名覆盖
   - shape 覆盖
   - `map_rows_to_dataset_payload` 覆盖
2. `tests/python/test_build_year_report.py`
   - `P05/P06/P09/P10` 页面结构断言
   - 关键词抽取结果断言
   - 评分字段断言

### Node

新增 / 扩展：

1. `tests/year-report/year-report-html.test.js`
   - `data-page="P05"`
   - `data-page="P06"`
   - `data-page="P09"`
   - `data-page="P10"`
   - `renderPageP05/P06/P09/P10`

## 实施顺序建议

1. 先补测试，让 `P05/P06/P09/P10` 相关断言变红
2. 补 `year_report_queries.py` 数据集和 SQL
3. 补 `build_year_report.py` 聚合逻辑
4. 补 HTML 页面壳
5. 补前端渲染函数
6. 跑 Python / Node 全量测试
7. 生成新的 `publish/report_2026_from_db.json`

## 结果预期

完成后，年报 MVP 将补上“行为解释 + 口味变化 + 关键词画像”这条主线：

1. `P05` 说明你是主动探索型还是回味型
2. `P06` 给出这一年的听歌关键词
3. `P09` 展示曲风如何变化
4. `P10` 给出可解释的口味评分

这样页面将不再只是“排行榜合集”，而更接近完整的年度报告叙事。
