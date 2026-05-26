export const FAST_SCROLL_MIN_ROWS = 36

export interface FastScrollTargetOptions {
  y: number
  height: number
  itemCount: number
  rowNum?: number | null
}

export interface FastScrollVisibleOptions {
  height: number
  itemCount: number
  rowNum?: number | null
}

export interface FastScrollHandleTopOptions {
  y: number
  height: number
  handleHeight: number
}

export interface FastScrollHandleTopByOffsetOptions {
  offset: number
  contentHeight: number
  height: number
  handleHeight: number
}

export interface FastScrollLocalYOptions {
  pageY: number
  containerPageY: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value))
}

const normalizeRowNum = (rowNum?: number | null): number => {
  // 横屏时 FlatList 会用多列渲染，这里统一折算成 FlatList 接收的“行号”。
  return rowNum && rowNum > 0 ? rowNum : 1
}

export const getFastScrollRowCount = (itemCount: number, rowNum?: number | null): number => {
  // 空列表至少按 0 行处理，避免后续拖动计算产生负数行号。
  if (itemCount <= 0) return 0
  return Math.ceil(itemCount / normalizeRowNum(rowNum))
}

export const getFastScrollTarget = ({ y, height, itemCount, rowNum }: FastScrollTargetOptions): number => {
  const rowCount = getFastScrollRowCount(itemCount, rowNum)
  if (height <= 0 || rowCount <= 0) return 0

  // 手指可能滑出热区，上下边界都要裁剪，保证 scrollToIndex 不越界。
  const ratio = Math.min(1, Math.max(0, y / height))
  return Math.min(rowCount - 1, Math.floor(ratio * rowCount))
}

export const shouldShowFastScroll = ({ height, itemCount, rowNum }: FastScrollVisibleOptions): boolean => {
  // 只有长列表才展示右侧快速滚动条，短列表继续保持原来的干净界面。
  return height > 0 && getFastScrollRowCount(itemCount, rowNum) > FAST_SCROLL_MIN_ROWS
}

export const getFastScrollHandleTop = ({ y, height, handleHeight }: FastScrollHandleTopOptions): number => {
  if (height <= 0 || handleHeight <= 0) return 0
  const maxTop = Math.max(0, height - handleHeight)

  // 把拖动位置对齐到把手中心，保证用户按住把手时视觉位置跟着手指走。
  return clamp(Math.round(y - handleHeight / 2), 0, maxTop)
}

export const getFastScrollHandleTopByOffset = ({ offset, contentHeight, height, handleHeight }: FastScrollHandleTopByOffsetOptions): number => {
  if (contentHeight <= height || height <= 0 || handleHeight <= 0) return 0
  const maxTop = Math.max(0, height - handleHeight)
  const maxOffset = contentHeight - height

  // 普通滚动时同步把手位置，避免把手固定在中间造成“不能拉”的误解。
  return clamp(Math.round((offset / maxOffset) * maxTop), 0, maxTop)
}

export const getFastScrollLocalY = ({ pageY, containerPageY }: FastScrollLocalYOptions): number => {
  // 拖动事件使用屏幕绝对坐标，减去热区屏幕顶部后得到稳定的本地 Y，避免移动中的把手反过来改变 locationY。
  return pageY - containerPageY
}
