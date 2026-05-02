# Essentia 曲风字段拆层设计

日期：2026-05-02  
状态：已确认，待写实施计划

## 概述

当前 `ods_jumusic_music_info` 已接入 Essentia 曲风识别结果，但只落了单一字段 `genre_essentia_label`，其内容形如：

- `Pop---J-pop`
- `Rock---Punk`
- `Electronic---Trance`

这个字段对于“展示一个结果”够用，但对于后续分析、统计、年报页面、标签聚合并不够友好。尤其是：

1. 不能直接按一级大类统计；
2. 不能方便地下钻二级细类；
3. 如果未来模型输出三级以上层级，又要改逻辑；
4. 不能同时兼顾“保留原始结果”和“便于结构化分析”。

因此，本设计把 Essentia 曲风结果从“单标签字符串”升级为“保留原始值 + 结构化拆层”的方案。

## 目标

1. 保留模型原始输出，避免信息丢失。
2. 在主表 `ods_jumusic_music_info` 中直接提供可分析字段。
3. 支持一级大类、二级细类、统一路径三种统计视角。
4. 兼容未来可能出现的三级及更多层级。
5. 尽量不影响当前已经跑通的 Linux 推理与回灌链路。

## 非目标

1. 本轮不改用新的曲风模型。
2. 本轮不做 top-N 多标签存储。
3. 本轮不单独新建一张多标签事实表。
4. 本轮不重做历史全部歌曲的全量识别，只先兼容增量与分批补数。

## 推荐方案

采用“主表多列拆层”方案，在 `ods_jumusic_music_info` 上新增以下字段：

1. `genre_essentia_raw_label`
   - 模型原始字符串输出。
   - 例如：`Pop---J-pop`

2. `genre_essentia_path`
   - 规范化路径字段。
   - 当前与 `raw_label` 一致，但语义上表示“层级路径”。
   - 例如：`Pop---J-pop`

3. `genre_essentia_parent`
   - 一级大类。
   - 例如：`Pop`

4. `genre_essentia_child`
   - 二级细类。
   - 例如：`J-pop`

5. `genre_essentia_depth`
   - 路径层级数。
   - `Pop---J-pop` 为 `2`
   - 若未来出现 `A---B---C`，则为 `3`

保留现有字段：

- `genre_essentia_confidence`
- `genre_essentia_model`
- `genre_essentia_source`
- `genre_essentia_inferred_at`

同时，`genre_essentia_label` 不再作为最终推荐分析字段，后续转为：

- 兼容历史代码的过渡字段；或
- 直接用作 `parent/child` 中的“默认展示标签”来源。

推荐做法是：

- 保留 `genre_essentia_label`
- 其值默认等于 `genre_essentia_child`
- 如果没有 child，则退化为 `parent`
- 如果都没有，则退化为 `raw_label`

这样旧页面不至于马上失效，新页面又能逐步迁移到结构化字段。

## 数据解析规则

Essentia 输出标签的默认分隔符为：`---`

解析规则：

1. 原始值先写入 `genre_essentia_raw_label`
2. 去首尾空白后写入 `genre_essentia_path`
3. 用 `---` 切分为数组 `parts`
4. 去掉空段与首尾空白
5. `genre_essentia_depth = len(parts)`
6. `genre_essentia_parent = parts[0]`（若存在）
7. `genre_essentia_child = parts[1]`（若存在）
8. `genre_essentia_label`
   - 优先 `child`
   - 否则 `parent`
   - 否则 `raw_label`

未来若有三级以上：

- `path` 保留完整层级
- `depth` 记录层数
- 当前仍只拆 `parent/child`
- 更深层级分析后续可再加 `genre_essentia_level3` 或从 `path` 动态切分

## 表结构调整

目标表：`dbo.ods_jumusic_music_info`

新增字段：

- `genre_essentia_raw_label nvarchar(255) null`
- `genre_essentia_path nvarchar(255) null`
- `genre_essentia_parent nvarchar(100) null`
- `genre_essentia_child nvarchar(100) null`
- `genre_essentia_depth int null`

并补充列注释，说明：

- raw_label：模型原始输出
- path：结构化层级路径
- parent：一级曲风大类
- child：二级曲风细类
- depth：层级深度

## 回灌链路设计

当前链路：

1. Linux 跑 Essentia 推理
2. 生成原始 JSON
3. Windows 侧路径映射
4. 写入 `ods_jumusic_music_info`

调整后：

1. Linux 输出仍保留最原始字段：
   - `label`
   - `confidence`
2. Windows 标准化时新增拆层逻辑：
   - 生成 `raw_label/path/parent/child/depth`
3. 回灌 ODS 时同时写：
   - `genre_essentia_raw_label`
   - `genre_essentia_path`
   - `genre_essentia_parent`
   - `genre_essentia_child`
   - `genre_essentia_depth`
   - `genre_essentia_label`
   - 以及现有 confidence/model/source/time

## 年报与分析口径

后续分析推荐优先级：

1. 一级分析：`genre_essentia_parent`
   - 用于大盘分布、年度重心、月份曲风迁移

2. 二级分析：`genre_essentia_child`
   - 用于更细的风格偏好解释
   - 如 `J-pop / Ballad / Punk / Trance`

3. 完整路径分析：`genre_essentia_path`
   - 用于需要最大区分度的聚合
   - 如“最常听的具体风格标签”

4. 兼容展示：`genre_essentia_label`
   - 用于旧逻辑、旧页面、简单榜单

推荐页面口径：

- 大类分布图：`parent`
- 细类 TopN：`child`
- 高精度标签榜：`path`

## 迁移策略

建议采用渐进式迁移：

### 第一步
- 补列
- 更新标准化 JSON 生成逻辑
- 更新回灌 SQL
- 新批次结果开始写拆层字段

### 第二步
- 对已有 100 首结果做一次重写
- 保证已入库样本也具备结构化字段

### 第三步
- 年报/分析脚本优先消费 `parent/child/path`
- 逐步减少对 `genre_essentia_label` 的直接依赖

## 风险与权衡

### 优点

1. 主表即可直接分析，查询简单。
2. 兼顾原始值保留与结构化统计。
3. 未来扩层时仍有回旋余地。
4. 对当前链路改动集中在标准化与入库环节，风险可控。

### 缺点

1. 仍然只显式拆到了 `parent/child`，三级以上暂未完全列化。
2. 主表字段会继续变多。
3. 若未来要保存多标签 top-N，仍可能需要单独子表。

## 验证方式

1. 单元测试：
   - `Pop---J-pop` 正确拆成 `parent=Pop`、`child=J-pop`、`depth=2`
   - 单层标签也能正确兼容
   - 空值/异常值不报错

2. SQL 验证：
   - 新增列存在
   - 已回灌样本字段非空

3. 数据抽查：
   - 抽 20 首样本，确认 `raw_label/path/parent/child/depth` 合理

4. 年报验证：
   - 曲风相关页面可同时输出“大类”和“细类”结果
