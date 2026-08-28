const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const rankingPath = path.resolve(__dirname, '../../src/utils/musicSearchRanking.ts')
const searchActionPath = path.resolve(__dirname, '../../src/store/search/music/action.ts')

const similarity = (left, right) => {
  const a = String(left).toLowerCase()
  const b = String(right).toLowerCase()
  if (a === b) return 1
  if (b.includes(a)) return a.length / b.length
  return 0
}

const loadRanking = () => {
  const source = fs.readFileSync(rankingPath, 'utf8')
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rankingPath,
  }).outputText
  const mod = new Module(rankingPath, module)
  mod.filename = rankingPath
  mod.paths = Module._nodeModulePaths(path.dirname(rankingPath))
  mod.require = request => {
    if (request === '@/utils/common') return { similar: similarity }
    throw new Error(`Unexpected dependency: ${request}`)
  }
  mod._compile(outputText, rankingPath)
  return mod.exports
}

// 直接执行搜索状态 action，验证真实分页合并与综合来源排序，而不是只测试纯排序函数。
const loadSearchAction = initialState => {
  const source = fs.readFileSync(searchActionPath, 'utf8')
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: searchActionPath,
  }).outputText
  const mod = new Module(searchActionPath, module)
  mod.filename = searchActionPath
  mod.paths = Module._nodeModulePaths(path.dirname(searchActionPath))
  mod.require = request => {
    if (request === './state') return initialState
    if (request === '@/utils/common') {
      return {
        arrPush: (target, items) => target.push(...items),
        similar: similarity,
      }
    }
    if (request === '@/utils') {
      return {
        deduplicationList: list => [...new Map(list.map(item => [item.id, item])).values()],
        toNewMusicInfo: item => item,
      }
    }
    if (request === '@/utils/musicSearchRanking') return loadRanking()
    throw new Error(`Unexpected dependency: ${request}`)
  }
  mod._compile(outputText, searchActionPath)
  return mod.exports.default
}

// 每个用例使用独立状态，避免分页列表和来源选择在测试间互相污染。
const createSearchState = () => ({
  maxPages: {},
  source: 'all',
  searchText: '',
  listInfos: {
    all: { list: [], page: 0, maxPage: 0, total: 0, limit: 30 },
    kw: { list: [], page: 0, maxPage: 0, total: 0, limit: 30 },
  },
})

const searchResult = (source, list, allPage = 1) => ({
  source,
  list,
  allPage,
  limit: 30,
  total: list.length,
})

test('sing ranking uses hard field tiers before source priority and fuzzy similarity', () => {
  const { rankMusicSearchResults } = loadRanking()
  const list = [
    { id: 'fuzzy_local', name: 'Sign', singer: 'Artist', source: 'local', meta: { albumName: '' } },
    { id: 'album', name: 'Anthem', singer: 'Artist', source: 'kw', meta: { albumName: 'Sing Collection' } },
    { id: 'singer', name: 'Anthem', singer: 'Singing Group', source: 'kw', meta: { albumName: '' } },
    { id: 'contains', name: 'Why We Sing', singer: 'Artist', source: 'kw', meta: { albumName: '' } },
    { id: 'prefix', name: 'Sing It', singer: 'Artist', source: 'kw', meta: { albumName: '' } },
    { id: 'exact', name: 'Sing', singer: 'Pentatonix', source: 'kw', meta: { albumName: 'Pentatonix' } },
  ]
  const ranked = rankMusicSearchResults(list, 'sing', {
    getSourcePriority: item => item.source === 'local' ? 0 : 99,
  })
  assert.deepEqual(ranked.map(item => item.id), ['exact', 'prefix', 'contains', 'singer', 'album', 'fuzzy_local'])
})

test('loose candidate matching keeps Sign for sing and escapes regex characters', () => {
  const { isLooseMusicSearchMatch } = loadRanking()
  assert.equal(isLooseMusicSearchMatch({ name: 'Sign', singer: '', meta: {} }, 'sing'), true)
  assert.equal(isLooseMusicSearchMatch({ name: 'A+B', singer: '', meta: {} }, 'a+b'), true)
})

test('ranking is case-insensitive and stable for final ties', () => {
  const { rankMusicSearchResults } = loadRanking()
  const list = [
    { id: 'first', name: 'SING', singer: 'A', meta: {} },
    { id: 'second', name: 'Sing', singer: 'B', meta: {} },
  ]
  assert.deepEqual(rankMusicSearchResults(list, '  sing  ').map(item => item.id), ['first', 'second'])
})

test('combined search lets an online exact title outrank a local fuzzy title', () => {
  const state = createSearchState()
  const action = loadSearchAction(state)
  const result = action.setListInfo([
    searchResult('local', [{ id: 'local_sign', name: 'Sign', singer: 'A', source: 'local', meta: {} }]),
    searchResult('kw', [{ id: 'kw_sing', name: 'Sing', singer: 'Pentatonix', source: 'kw', meta: {} }]),
  ], 1, 'sing')
  assert.deepEqual(result.map(item => item.id), ['kw_sing', 'local_sign'])
})

test('single-source search reranks later exact pages against accumulated fuzzy results', () => {
  const state = createSearchState()
  const action = loadSearchAction(state)
  action.setListInfo(searchResult('kw', [
    { id: 'sign', name: 'Sign', singer: 'A', source: 'kw', meta: {} },
  ], 2), 1, 'sing')
  const result = action.setListInfo(searchResult('kw', [
    { id: 'sing', name: 'Sing', singer: 'Pentatonix', source: 'kw', meta: {} },
  ], 2), 2, 'sing')
  assert.deepEqual(result.map(item => item.id), ['sing', 'sign'])
})
