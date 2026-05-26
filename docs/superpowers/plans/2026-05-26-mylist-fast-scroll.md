# 我的列表快速滚动实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 给“我的列表”歌曲列表增加右侧拖拽快速滚动热区，长列表可以按比例快速跳转。

**架构：** 把触点 Y 坐标到目标列表行的换算放进独立纯函数，使用 Node 测试锁定边界。UI 层在现有 `FlatList` 外包一层容器，右侧覆盖一个轻量 `PanResponder` 热区，拖动时调用 `scrollToIndex`。

**技术栈：** React Native `FlatList`、`PanResponder`、Node `node:test`、TypeScript 转译测试。

---

## 文件结构

- 创建：`src/screens/Home/Views/Mylist/MusicList/fastScroll.ts`
  负责快速滚动的纯计算：比例裁剪、目标行号、是否需要展示快速滚动条。
- 创建：`tests/media-library/mylist-fast-scroll.test.js`
  负责转译并执行 `fastScroll.ts`，验证短列表隐藏、越界坐标裁剪、横屏多列行号换算。
- 修改：`src/screens/Home/Views/Mylist/MusicList/List.tsx`
  在现有歌曲 `FlatList` 右侧增加拖拽热区，并把拖拽位置换算为 `scrollToIndex`。

## 任务 1：快速滚动计算

**文件：**
- 创建：`src/screens/Home/Views/Mylist/MusicList/fastScroll.ts`
- 创建：`tests/media-library/mylist-fast-scroll.test.js`

- [ ] **步骤 1：编写失败测试**

```js
test('mylist fast scroll maps drag y to bounded row index', () => {
  const { getFastScrollTarget } = loadFastScrollModule()
  assert.equal(getFastScrollTarget({ y: 240, height: 480, itemCount: 100, rowNum: 1 }), 50)
  assert.equal(getFastScrollTarget({ y: -10, height: 480, itemCount: 100, rowNum: 1 }), 0)
  assert.equal(getFastScrollTarget({ y: 999, height: 480, itemCount: 100, rowNum: 1 }), 99)
})
```

运行：`node --test tests/media-library/mylist-fast-scroll.test.js`
预期：FAIL，原因是 `fastScroll.ts` 尚不存在。

- [ ] **步骤 2：实现最小纯函数**

```ts
export const getFastScrollTarget = ({ y, height, itemCount, rowNum }: FastScrollTargetOptions): number => {
  if (height <= 0 || itemCount <= 0) return 0
  const safeRowNum = rowNum && rowNum > 0 ? rowNum : 1
  const rowCount = Math.max(1, Math.ceil(itemCount / safeRowNum))
  const ratio = Math.min(1, Math.max(0, y / height))
  return Math.min(rowCount - 1, Math.floor(ratio * rowCount))
}
```

运行：`node --test tests/media-library/mylist-fast-scroll.test.js`
预期：PASS。

## 任务 2：接入我的列表 UI

**文件：**
- 修改：`src/screens/Home/Views/Mylist/MusicList/List.tsx`

- [ ] **步骤 1：把 `FlatList` 放入相对定位容器**

```tsx
<View style={styles.container} onLayout={handleListLayout}>
  <FlatList ... />
  {isFastScrollVisible ? <View ... /> : null}
</View>
```

- [ ] **步骤 2：添加 `PanResponder` 热区并调用 `scrollToIndex`**

```tsx
const fastScrollPanResponder = useMemo(() => PanResponder.create({
  onStartShouldSetPanResponder: () => isFastScrollEnabled,
  onMoveShouldSetPanResponder: () => isFastScrollEnabled,
  onPanResponderGrant: event => handleFastScrollGesture(event.nativeEvent.locationY),
  onPanResponderMove: event => handleFastScrollGesture(event.nativeEvent.locationY),
}), [handleFastScrollGesture, isFastScrollEnabled])
```

- [ ] **步骤 3：保留现有滚动位置持久化**

`handleFastScrollGesture` 只负责调用 `scrollToIndex`；实际位置仍由现有 `onScroll` 触发 `saveListPosition`。

运行：`node --test tests/media-library/mylist-fast-scroll.test.js`
预期：PASS。

## 任务 3：验证

- [ ] **步骤 1：运行新增测试**

运行：`node --test tests/media-library/mylist-fast-scroll.test.js`
预期：PASS。

- [ ] **步骤 2：运行相关媒体库测试**

运行：`node --test tests/media-library/music-detail-modal.test.js tests/media-library/mylist-fast-scroll.test.js`
预期：PASS。

- [ ] **步骤 3：运行 lint**

运行：`npm run lint -- --quiet`
预期：无错误。
