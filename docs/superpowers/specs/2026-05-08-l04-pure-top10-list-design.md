# L04 纯 Top10 列表展示设计

日期：2026-05-08  
状态：待评审

## 1. 目标

把当前 `L04A / L04B` 的“Top1 主角卡 + Top2~Top10 列表”展示结构，调整为**纯 Top10 列表**，让用户在页面上直接看到 10 条榜单行。

本次只处理：

1. `L04A` 与 `L04B` 的前端展示结构调整；
2. 年报 sample contract 的榜单数据补齐到 10 条；
3. 前端测试与展示预期同步更新。

本次不处理：

1. Python 年报聚合逻辑变更；
2. `payload.ranking` 字段结构变更；
3. 榜单排序规则变更；
4. 其他 `Pxx / Lxx` 页面样式重构。

---

## 2. 问题背景

当前正式 contract 中，`L04A / L04B` 的 `payload.ranking` 已经能够提供 Top10 数据；当真实数据不足 10 条时，contract builder 也会做补齐，避免页面结构塌陷。

但前端页面目前采用：

1. `Top1` 单独抽成 hero 主角区；
2. 列表区只显示 `Top2 ~ Top10`；
3. 因此前端列表区只能看到 9 条。

这会造成两个问题：

1. 用户直觉上会把该页理解成“Top10 列表页”，但实际列表只显示 9 条；
2. `report-contract.sample.json` 当前 `L04A / L04B` 条数不足 10，fallback 预览时与正式 contract 的展示预期不一致。

---

## 3. 已确认决策

采用 **纯 Top10 列表方案**：

- `L04A`：保留“歌曲库歌手榜”页面定位，但取消冠军 hero 卡，直接展示 10 条榜单；
- `L04B`：保留“年度新增歌手榜”页面定位，但取消冠军 hero 卡，直接展示 10 条榜单；
- `tools/year-report-app/public/report-contract.sample.json` 中的 `L04A / L04B` 样例数据同步补满 10 条；
- Python contract 与聚合逻辑不改，继续沿用现有 `payload.ranking` 输出。

---

## 4. 设计原则

### 4.1 用户看到的列表就是 10 条

页面既然对外表达为“Top10 榜单”，那视觉上就应直接呈现 10 条榜单项，而不是要求用户理解“1 条主角卡 + 9 条列表 = Top10”。

### 4.2 保持 contract 不动，优先收敛前端解释层

当前数据 contract 已经稳定：

- 正式 contract 可提供 Top10；
- contract builder 可在数据不足时补位；
- 前端也统一从 `payload.ranking` 取值。

因此本次只调整展示层，不重新设计字段，也不修改后端/脚本排序逻辑。

### 4.3 sample 与正式预览体验保持一致

sample contract 作为 fallback 数据源，不应再出现明显少条的榜单演示效果。即使进入 fallback 路径，也要让 `L04A / L04B` 看起来就是完整 Top10 页面。

---

## 5. 数据 contract 约束

### 5.1 正式 contract

本次继续沿用：

- `L04A.payload.ranking`
- `L04B.payload.ranking`

字段不改，rank 语义不改，排序规则不改。

### 5.2 sample contract

`tools/year-report-app/public/report-contract.sample.json` 中：

- `L04A.payload.ranking` 必须补到 10 条；
- `L04B.payload.ranking` 必须补到 10 条。

样例数据要求：

1. 维持现有字段结构；
2. 使用可读、像真实数据的样例值；
3. 不使用“待补位歌手”这类明显占位文案；
4. `rank` 连续覆盖 `1 ~ 10`。

---

## 6. 前端页面结构设计

### 6.1 L04A 页面

页面保留：

1. 标题：`歌曲库歌手榜`；
2. 副标题：`全曲库收藏最多的 10 位歌手`；
3. 页尾摘要卡；
4. 现有整体主题色与页面外壳。

页面移除：

1. `Top1` 主角卡；
2. `champion` / `runnerUps` 的拆分叙事。

页面改为：

1. 直接读取 `topTenRanking`；
2. 渲染 10 条连续榜单项；
3. 每条项至少展示：
   - 排名；
   - 歌手名；
   - 收藏歌曲数；
   - 专辑数；
   - 代表作（如版式允许则展示，否则可保留为次级文案）。

### 6.2 L04B 页面

页面保留：

1. 标题：`年度新增歌手榜`；
2. 副标题：`今年扩坑最多的 10 位歌手`；
3. 页尾摘要卡；
4. 现有整体主题色与页面外壳。

页面移除：

1. `Top1` 主角卡；
2. `champion` / `runnerUps` 的拆分叙事。

页面改为：

1. 直接读取 `topTenRanking`；
2. 渲染 10 条连续榜单项；
3. 每条项至少展示：
   - 排名；
   - 歌手名；
   - 新增歌曲数；
   - 新增专辑数；
   - `highlight_tag`（有值时展示，无值时可省略）。

---

## 7. 视觉与交互约束

### 7.1 视觉结构

改成纯列表后，页面重心从“冠军强化”转向“榜单完整性”。因此样式上应满足：

1. 列表项之间层级清晰；
2. `#1` 仍可通过字号、背景或边框轻度强调，但不能再独立脱离列表；
3. `#1 ~ #10` 必须在同一列表语义内连续出现；
4. 不能因为去掉 hero 卡导致页面顶部空洞。

### 7.2 交互与滚动

本次不新增整页滚动逻辑。

默认要求：

1. 单页内仍以静态展示为主；
2. 若 10 条列表在当前版式下高度吃紧，只允许对列表内部做轻量压缩，不引入新的复杂滚动交互；
3. 导出 PDF 时页面应保持完整可截取，不依赖额外展开操作。

---

## 8. 实现边界

### 8.1 需要修改的内容

- `tools/year-report-app/src/pages/L04LibraryArtistRankingPage.vue`
- `tools/year-report-app/src/pages/L04NewArtistRankingPage.vue`
- `tools/year-report-app/src/__tests__/year-report-mobile-app.test.js`
- `tools/year-report-app/public/report-contract.sample.json`

如样式类名无法复用，可同步调整：

- `tools/year-report-app/src/styles.css`

### 8.2 不应修改的内容

- `scripts/year_report/build_year_report.py`
- `scripts/year_report/year_report_contract_builder.py`
- 其他页面的 contract 字段
- `L04A / L04B` 的页码、模板名、section 归属

---

## 9. 测试策略

### 9.1 前端单测

至少覆盖：

1. `L04A` 页面渲染 10 条列表项；
2. `L04B` 页面渲染 10 条列表项；
3. 页面文本包含第 1 名与第 10 名；
4. 页面文本不包含第 11 名；
5. 不再依赖 hero 区存在性断言。

### 9.2 数据回归

至少验证：

1. 正式 `report-contract.json` 中 `L04A / L04B` 仍为 10 条；
2. sample contract 中 `L04A / L04B` 调整后为 10 条；
3. fallback 到 sample 时页面仍显示完整 10 条。

---

## 10. 风险与处理

### 风险 1：去掉 hero 后页面表现变平

处理：

- 保留榜单首位轻度强调；
- 通过列表首项背景、字号或边框层级维持视觉起点；
- 不再做独立大卡，但保留第一名的识别度。

### 风险 2：10 条纯列表在移动端高度偏紧

处理：

- 优先压缩列表项内边距、次级文案字重与行距；
- 若仍偏紧，弱化非关键信息密度，而不是回退到 hero 方案。

### 风险 3：sample 数据与测试数据继续漂移

处理：

- 本次同步更新 sample 与前端测试断言；
- 以后凡修改 L04 页面结构，优先同步校验 sample 的榜单长度与字段形态。

---

## 11. 结论

本次改动的最终目标不是改变榜单数据，而是让用户看到的页面形式与“Top10 榜单”这件事保持一致。

因此本次实现应采用：

1. `L04A / L04B` 改为纯 Top10 列表；
2. 取消 Top1 独立 hero 卡；
3. sample contract 同步补齐到 10 条；
4. Python contract 与聚合逻辑保持不变。
