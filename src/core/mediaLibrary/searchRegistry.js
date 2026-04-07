const { normalizeText } = require('./normalize.js')

const LIBRARY_SOURCES = ['local', 'webdav', 'smb', 'onedrive']
const LIBRARY_SOURCE_SET = new Set(LIBRARY_SOURCES)
const SOURCE_PRIORITY = new Map(LIBRARY_SOURCES.map((source, index) => [source, index]))

function isLibrarySource(source) {
  return LIBRARY_SOURCE_SET.has(source)
}

function getSearchSources(onlineSources = []) {
  return [
    ...LIBRARY_SOURCES,
    ...onlineSources.filter(source => !LIBRARY_SOURCE_SET.has(source) && source !== 'all'),
    'all',
  ]
}

function getSourcePriority(source) {
  return SOURCE_PRIORITY.get(source) ?? 99
}

function rankAggregatedResults(results = []) {
  return [...results].sort((left, right) => {
    return getSourcePriority(left.source) - getSourcePriority(right.source)
  })
}

function buildSearchText(item) {
  return normalizeText(`${item.name || ''} ${item.singer || ''} ${item.meta?.albumName || ''}`)
}

function searchLibrarySongs({ keyword, source, aggregateSongs = [], sourceItems = [] }) {
  const normalizedKeyword = normalizeText(keyword)
  const targetList = source === 'all'
    ? aggregateSongs
    : sourceItems.filter(item => item.source === source)

  const list = targetList.filter(item => buildSearchText(item).includes(normalizedKeyword))

  return {
    list: source === 'all' ? rankAggregatedResults(list) : list,
    allPage: list.length ? 1 : 0,
    limit: 30,
    total: list.length,
    source,
  }
}

module.exports = {
  LIBRARY_SOURCES,
  isLibrarySource,
  getSearchSources,
  rankAggregatedResults,
  searchLibrarySongs,
}
