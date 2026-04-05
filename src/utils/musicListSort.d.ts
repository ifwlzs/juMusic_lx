export function getDefaultSortType(fieldName: LX.List.ListSortField): LX.List.ListSortType

export function isGeneratedMediaSourceList(listInfo: LX.List.MyListInfo | null | undefined): boolean

export function sortListMusicInfo(
  list: LX.Music.MusicInfo[],
  sortType: LX.List.ListSortType,
  fieldName: LX.List.ListSortField,
  localeId?: string,
): LX.Music.MusicInfo[]

export function applyGeneratedListSortPreference(
  listInfo: LX.List.MyListInfo | null | undefined,
  list: LX.Music.MusicInfo[],
  preference: LX.List.ListSortPreference | null | undefined,
  localeId?: string,
): LX.Music.MusicInfo[]
