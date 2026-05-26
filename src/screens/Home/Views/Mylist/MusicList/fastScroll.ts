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
