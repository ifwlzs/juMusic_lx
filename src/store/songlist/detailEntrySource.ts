import { type SonglistDetailEntrySource } from './state'

export const resolveDetailEntrySourceById = (
  id: string,
  detailEntrySource?: SonglistDetailEntrySource,
): SonglistDetailEntrySource => {
  if (detailEntrySource) return detailEntrySource
  const normalized = String(id || '').toLowerCase()
  if (normalized.includes('singer') || normalized.includes('artist')) return 'artist_detail'
  if (normalized.includes('album')) return 'album_detail'
  return detailEntrySource || 'songlist_detail'
}

