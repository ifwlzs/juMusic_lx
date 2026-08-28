# Music Search Relevance Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make strict song-title matches reliably outrank fuzzy results such as `Sign` for query `sing` across combined search, single-source search, and list-local search without removing fuzzy recall.

**Architecture:** Introduce one pure field-aware ranking module that assigns a hard match tier before considering source priority or similarity. The combined and single-source search stores use it as a post-fetch re-ranker, while list-local search keeps its current loose candidate filter and delegates ordering to the same module. Stable original indexes resolve final ties.

**Tech Stack:** TypeScript 5.9, React Native application state, Node `node:test`, TypeScript `transpileModule`, ESLint.

## Global Constraints

- Query comparison trims outer whitespace, collapses internal whitespace, and is case-insensitive.
- Result tiers are fixed: exact title, title prefix, title contiguous substring, singer contiguous substring, album contiguous substring, loose/fuzzy match.
- A lower-quality tier can never outrank a higher-quality tier because of source priority or edit-distance score.
- Existing combined-search source priority remains, but only after match tier.
- Online-source results are not deleted; `Sign` may remain visible for `sing`, below strict matches.
- Similarity is calculated per field, never against a concatenated `name + singer + album` string.
- Equal tier, source priority, position, and similarity preserve original input order.
- Page 2 or later results are ranked together with already loaded results so a newly fetched exact match can move above older fuzzy entries.
- Every new function and nontrivial comparison branch receives a concise Chinese comment explaining ranking intent.

---

## File Structure

**Create:**

- `src/utils/musicSearchRanking.ts` - shared normalization, tier classification, loose candidate matching, and stable ranking.
- `tests/search/music-ranking.test.js` - executes the TypeScript ranking module and the global search action with controlled state.

**Modify:**

- `src/store/search/music/action.ts` - uses shared ranking for combined and single-source result sets.
- `src/screens/Home/Views/Mylist/MusicList/listAction.ts` - retains loose filtering and delegates ordering to the shared ranker.
- `tests/mylist/artist-related-songs.test.js` - adds list-local search regression behavior.
- `tests/media-library/search-integration.test.js` - adds a static integration contract for the shared ranking path.
- `CHANGELOG.md` - records improved search relevance.

---

### Task 1: Create the shared field-aware ranking module

**Files:**
- Create: `src/utils/musicSearchRanking.ts`
- Create: `tests/search/music-ranking.test.js`

**Interfaces:**
- Produces: `normalizeMusicSearchText(value: string): string`.
- Produces: `isLooseMusicSearchMatch(item: MusicSearchRankItem, keyword: string): boolean`.
- Produces: `rankMusicSearchResults<T extends MusicSearchRankItem>(list: T[], keyword: string, options?: MusicSearchRankOptions<T>): T[]`.
- Consumes: `similar(a, b)` from `@/utils/common` as the default layer-internal similarity function.

- [ ] **Step 1: Create the TypeScript module test loader**

Create `tests/search/music-ranking.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const rankingPath = path.resolve(__dirname, '../../src/utils/musicSearchRanking.ts')

// 测试用相似度只服务同层比较；硬分层结果不得依赖它跨层翻转。
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
```

- [ ] **Step 2: Add failing ranking and fuzzy-retention tests**

Append:

```js
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

  assert.deepEqual(ranked.map(item => item.id), [
    'exact', 'prefix', 'contains', 'singer', 'album', 'fuzzy_local',
  ])
})

test('loose candidate matching keeps Sign for sing and escapes regex characters', () => {
  const { isLooseMusicSearchMatch } = loadRanking()
  const sign = { name: 'Sign', singer: '', meta: { albumName: '' } }
  assert.equal(isLooseMusicSearchMatch(sign, 'sing'), true)
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
```

- [ ] **Step 3: Run the test and verify RED**

```powershell
node --test tests/search/music-ranking.test.js
```

Expected: FAIL because `musicSearchRanking.ts` does not exist.

- [ ] **Step 4: Implement normalization, tiering, and stable sorting**

Create `src/utils/musicSearchRanking.ts` with these public types:

```ts
import { similar } from '@/utils/common'

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
```

Use numeric tiers `0..5` in the required order. Classify with normalized fields:

```ts
if (name === keyword) return { tier: 0, field: name, position: 0 }
if (name.startsWith(keyword)) return { tier: 1, field: name, position: 0 }
if (name.includes(keyword)) return { tier: 2, field: name, position: name.indexOf(keyword) }
if (singer.includes(keyword)) return { tier: 3, field: singer, position: singer.indexOf(keyword) }
if (album.includes(keyword)) return { tier: 4, field: album, position: album.indexOf(keyword) }
return { tier: 5, field: [name, singer, album].sort((a, b) => similar(keyword, b) - similar(keyword, a))[0], position: Number.MAX_SAFE_INTEGER }
```

For each item record:

- match tier ascending;
- source priority ascending, default `99`;
- match position ascending;
- field similarity descending;
- original index ascending.

The comparator must compare in exactly that order. Empty normalized queries return a shallow copy in original order.

Implement `isLooseMusicSearchMatch` by escaping every query character and joining with `.*`, matching against `${name}${singer}${album}` case-insensitively. Empty queries return `false`.

- [ ] **Step 5: Run tests and TypeScript**

```powershell
node --test tests/search/music-ranking.test.js
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit the shared ranker**

```powershell
git add src/utils/musicSearchRanking.ts tests/search/music-ranking.test.js
git commit -m "feat(search): add field-aware relevance ranking"
```

---

### Task 2: Apply ranking to combined and single-source search

**Files:**
- Modify: `src/store/search/music/action.ts`
- Modify: `tests/search/music-ranking.test.js`
- Modify: `tests/media-library/search-integration.test.js`

**Interfaces:**
- Consumes: `rankMusicSearchResults` from Task 1.
- Produces: strict-match-first ordering for `all` aggregation and every individual search source.
- Preserves: source order `local`, `webdav`, `smb`, `onedrive`, then online sources, as a same-tier secondary key.

- [ ] **Step 1: Add an executable global action harness**

Extend `tests/search/music-ranking.test.js` with `loadSearchAction(initialState)`. Transpile `src/store/search/music/action.ts` and provide these stubs:

```js
case './state': return initialState
case '@/utils/common': return { arrPush: (target, items) => target.push(...items), similar: similarity }
case '@/utils': return {
  deduplicationList: list => [...new Map(list.map(item => [item.id, item])).values()],
  toNewMusicInfo: item => item,
}
case '@/utils/musicSearchRanking': return loadRanking()
```

Return `mod.exports.default`.

- [ ] **Step 2: Add failing combined, single-source, and pagination behavior tests**

Use a fresh state object with `listInfos.all` and `listInfos.kw`. Assert:

```js
test('combined search lets an online exact title outrank a local fuzzy title', () => {
  const state = createSearchState()
  const action = loadSearchAction(state)
  const result = action.setListInfo([
    searchResult('local', [{ id: 'local_sign', name: 'Sign', singer: 'A', source: 'local', meta: {} }]),
    searchResult('kw', [{ id: 'kw_sing', name: 'Sing', singer: 'Pentatonix', source: 'kw', meta: {} }]),
  ], 1, 'sing')
  assert.deepEqual(result.map(item => item.id), ['kw_sing', 'local_sign'])
})

test('single-source search reranks server results and later exact pages against accumulated fuzzy results', () => {
  const state = createSearchState()
  const action = loadSearchAction(state)
  action.setListInfo(searchResult('kw', [{ id: 'sign', name: 'Sign', singer: 'A', source: 'kw', meta: {} }], 2), 1, 'sing')
  const result = action.setListInfo(searchResult('kw', [{ id: 'sing', name: 'Sing', singer: 'Pentatonix', source: 'kw', meta: {} }], 2), 2, 'sing')
  assert.deepEqual(result.map(item => item.id), ['sing', 'sign'])
})
```

Add a static assertion to `tests/media-library/search-integration.test.js` that `src/store/search/music/action.ts` imports and invokes `rankMusicSearchResults` for both `setLists` and `setList` paths.

- [ ] **Step 3: Run tests and verify RED**

```powershell
node --test tests/search/music-ranking.test.js tests/media-library/search-integration.test.js
```

Expected: FAIL because the global action still sorts by source before similarity and does not rerank a single source.

- [ ] **Step 4: Replace concatenated-string sorting with shared ranking**

In `src/store/search/music/action.ts`:

- Remove the `similar` import.
- Import `rankMusicSearchResults`.
- Keep `getSourcePriority`.
- Replace `handleSortList` with:

```ts
// 严格命中层级先于来源优先级，避免本地模糊结果压过其他来源的精确标题。
const handleSortList = (list: LX.Music.MusicInfo[], keyword: string) => {
  return rankMusicSearchResults(list, keyword, { getSourcePriority: item => getSourcePriority(item.source) })
}
```

- In `setLists`, deduplicate the page-1 or accumulated list first, then rank the whole list with `text`.
- Change `setList(datas, page)` to `setList(datas, page, text)`.
- In `setList`, normalize incoming items, merge with prior pages, deduplicate, then call `handleSortList` on the full merged list.
- Pass `text` from `setListInfo` into `setList`.

Do not filter server results in either path.

- [ ] **Step 5: Run focused tests and TypeScript**

```powershell
node --test tests/search/music-ranking.test.js tests/media-library/search-integration.test.js
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit global search integration**

```powershell
git add src/store/search/music/action.ts tests/search/music-ranking.test.js tests/media-library/search-integration.test.js
git commit -m "fix(search): prioritize strict matches in search results"
```

---

### Task 3: Apply the shared ranking to list-local search

**Files:**
- Modify: `src/screens/Home/Views/Mylist/MusicList/listAction.ts`
- Modify: `tests/mylist/artist-related-songs.test.js`

**Interfaces:**
- Consumes: `isLooseMusicSearchMatch` and `rankMusicSearchResults` from Task 1.
- Produces: the existing `searchListMusic(list, text)` API with fuzzy retention and strict ranking.
- Removes: direct use of `similar` and `sortInsert` from `listAction.ts` search logic.

- [ ] **Step 1: Update the existing test module loader for the new dependency**

In `loadListActionModule`, add:

```js
case '@/utils/musicSearchRanking':
  return loadMusicSearchRankingModule()
```

Add a small transpile loader for `musicSearchRanking.ts` using the same `similarity` helper as the search tests. Keep all existing list-action dependency stubs unchanged.

- [ ] **Step 2: Add failing list-local regression tests**

Append:

```js
test('searchListMusic keeps fuzzy results but raises strict sing matches above sign', () => {
  const { searchListMusic } = loadListActionModule()
  const list = [
    { id: 'sign', name: 'Sign', singer: 'A', meta: { albumName: '' } },
    { id: 'album', name: 'Anthem', singer: 'A', meta: { albumName: 'Sing Collection' } },
    { id: 'contains', name: 'Why We Sing', singer: 'A', meta: { albumName: '' } },
    { id: 'exact', name: 'Sing', singer: 'Pentatonix', meta: { albumName: 'Pentatonix' } },
  ]

  assert.deepEqual(searchListMusic(list, 'sing').map(item => item.id), [
    'exact', 'contains', 'album', 'sign',
  ])
})

test('searchListMusic compares case-insensitively and preserves tied input order', () => {
  const { searchListMusic } = loadListActionModule()
  const list = [
    { id: 'first', name: 'SING', singer: 'A', meta: {} },
    { id: 'second', name: 'Sing', singer: 'B', meta: {} },
  ]
  assert.deepEqual(searchListMusic(list, ' Sing ').map(item => item.id), ['first', 'second'])
})
```

- [ ] **Step 3: Run the list test and verify RED**

```powershell
node --test tests/mylist/artist-related-songs.test.js
```

Expected: the new ordering test FAILS against the old concatenated-string similarity implementation.

- [ ] **Step 4: Delegate filtering and ranking to the shared module**

Change imports in `listAction.ts`:

```ts
import { toOldMusicInfo } from '@/utils'
import { isLooseMusicSearchMatch, rankMusicSearchResults } from '@/utils/musicSearchRanking'
```

Replace `searchListMusic` with:

```ts
// 保留原字符穿插召回，再用共享硬分层确保严格标题命中稳定置顶。
export const searchListMusic = (list: LX.Music.MusicInfo[], text: string) => {
  const candidates = list.filter(item => isLooseMusicSearchMatch(item, text))
  return rankMusicSearchResults(candidates, text)
}
```

Remove unused `similar` and `sortInsert` imports. Do not change artist-related search or any list mutation action.

- [ ] **Step 5: Run list tests, search tests, and TypeScript**

```powershell
node --test tests/mylist/artist-related-songs.test.js tests/search/music-ranking.test.js
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit list-local integration**

```powershell
git add src/screens/Home/Views/Mylist/MusicList/listAction.ts tests/mylist/artist-related-songs.test.js
git commit -m "fix(search): rank strict matches in list search"
```

---

### Task 4: Document and verify search relevance end to end

**Files:**
- Modify: `CHANGELOG.md`
- Verify: all files from Tasks 1-3

**Interfaces:**
- Consumes: completed shared ranking and integrations.
- Produces: changelog entry and fresh regression evidence.

- [ ] **Step 1: Add a concise changelog entry**

Under the current unreleased section, add a Chinese bullet explaining that exact title, prefix, and contiguous matches now outrank fuzzy results in combined, single-source, and list-local search while fuzzy recall remains available.

- [ ] **Step 2: Run all search-focused tests**

```powershell
node --test tests/search/music-ranking.test.js tests/media-library/search-integration.test.js tests/mylist/artist-related-songs.test.js
```

Expected: `0` failed.

- [ ] **Step 3: Run the full media-library suite**

```powershell
npm run test:media-library
```

Expected: `0` failed.

- [ ] **Step 4: Run TypeScript and focused ESLint**

```powershell
npx tsc --noEmit
npx eslint src/utils/musicSearchRanking.ts src/store/search/music/action.ts src/screens/Home/Views/Mylist/MusicList/listAction.ts tests/search/music-ranking.test.js tests/media-library/search-integration.test.js tests/mylist/artist-related-songs.test.js
```

Expected: both commands exit `0` with no ESLint errors.

- [ ] **Step 5: Run the original `sing` acceptance fixture directly**

```powershell
node -e "const fs=require('fs'); const p='tests/search/music-ranking.test.js'; if(!fs.readFileSync(p,'utf8').includes('Pentatonix')) process.exit(1)"
node --test --test-name-pattern="sing|strict|exact" tests/search/music-ranking.test.js tests/mylist/artist-related-songs.test.js
```

Expected: the fixture guard exits `0`; all selected tests pass and show `Sing` before `Sign`.

- [ ] **Step 6: Inspect diff quality and commit documentation**

```powershell
git diff --check
git diff -- src/utils/musicSearchRanking.ts src/store/search/music/action.ts src/screens/Home/Views/Mylist/MusicList/listAction.ts
git add CHANGELOG.md
git commit -m "docs: record search relevance improvements"
```
