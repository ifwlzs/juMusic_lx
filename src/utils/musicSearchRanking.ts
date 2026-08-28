import { similar } from '@/utils/common'

// 搜索排序只读取歌曲展示字段，避免把不同来源的内部元数据耦合进相关性算法。
export interface MusicSearchRankItem {
  name?: string
  singer?: string
  source?: string
  meta?: { albumName?: string }
}

export interface MusicSearchRankOptions<T extends MusicSearchRankItem> {
  getSourcePriority?: (item: T) => number
  calculateSimilarity?: (keyword: string, fieldValue: string) => number
}

export const normalizeMusicSearchText = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const getFields = (item: MusicSearchRankItem) => ({
  name: normalizeMusicSearchText(item.name ?? ''),
  singer: normalizeMusicSearchText(item.singer ?? ''),
  album: normalizeMusicSearchText(item.meta?.albumName ?? ''),
})

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 宽松召回保留原有字符穿插规则，并补充编辑距离较近的候选以兼容在线源的模糊结果。
export const isLooseMusicSearchMatch = (item: MusicSearchRankItem, keyword: string) => {
  const query = normalizeMusicSearchText(keyword)
  if (!query) return false
  const fields = getFields(item)
  const text = `${fields.name}${fields.singer}${fields.album}`
  const subsequence = new RegExp(query.split('').map(escapeRegExp).join('.*'), 'i').test(text)
  if (subsequence) return true
  // 在线源常把相邻字符顺序打乱，保留“字符均出现”的低置信度召回供最低层排序。
  if ([...query].every(character => text.includes(character))) return true
  return similar(query, text) >= 0.28
}

type MatchTier = 0 | 1 | 2 | 3 | 4 | 5

interface MatchInfo {
  tier: MatchTier
  field: string
  position: number
}

const classifyMatch = (fields: ReturnType<typeof getFields>, query: string): MatchInfo => {
  if (fields.name === query) return { tier: 0, field: fields.name, position: 0 }
  if (fields.name.startsWith(query)) return { tier: 1, field: fields.name, position: 0 }
  const titlePosition = fields.name.indexOf(query)
  if (titlePosition >= 0) return { tier: 2, field: fields.name, position: titlePosition }
  const singerPosition = fields.singer.indexOf(query)
  if (singerPosition >= 0) return { tier: 3, field: fields.singer, position: singerPosition }
  const albumPosition = fields.album.indexOf(query)
  if (albumPosition >= 0) return { tier: 4, field: fields.album, position: albumPosition }

  // 模糊层仍然保留召回，但明确标记为最低层，不能反超任何连续文本命中。
  const fuzzyField = [fields.name, fields.singer, fields.album]
    .sort((left, right) => similar(query, right) - similar(query, left))[0] ?? ''
  return { tier: 5, field: fuzzyField, position: Number.MAX_SAFE_INTEGER }
}

export const rankMusicSearchResults = <T extends MusicSearchRankItem>(
  list: T[],
  keyword: string,
  options: MusicSearchRankOptions<T> = {},
) => {
  const query = normalizeMusicSearchText(keyword)
  if (!query) return [...list]
  const calculateSimilarity = options.calculateSimilarity ?? similar
  const getSourcePriority = options.getSourcePriority ?? (() => 99)

  return list
    .map((item, index) => {
      const fields = getFields(item)
      const match = classifyMatch(fields, query)
      return {
        item,
        index,
        tier: match.tier,
        sourcePriority: getSourcePriority(item),
        position: match.position,
        score: calculateSimilarity(query, match.field),
      }
    })
    .sort((left, right) => (
      left.tier - right.tier
      || left.sourcePriority - right.sourcePriority
      || left.position - right.position
      || right.score - left.score
      || left.index - right.index
    ))
    .map(entry => entry.item)
}
