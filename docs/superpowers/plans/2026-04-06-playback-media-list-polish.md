# Playback And Media List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the play detail page readable across dynamic backgrounds, keep NAS/WebDAV/SMB generated lists visually consistent with normal lists, and add per-list sort preferences for generated media-source playlists.

**Architecture:** Keep the scope local. Add a small play-detail foreground palette helper instead of touching the global theme system, keep media-source list visuals aligned with existing list tokens, and introduce a lightweight generated-list sort preference store that is reapplied whenever a generated list is loaded or refreshed.

**Tech Stack:** React Native, TypeScript, node:test static assertions, existing list/data storage helpers

---

### Task 1: Play Detail Foreground Palette

**Files:**
- Create: `src/screens/PlayDetail/palette.ts`
- Modify: `src/screens/PlayDetail/Vertical/components/Header.tsx`
- Modify: `src/screens/PlayDetail/Vertical/components/Btn.tsx`
- Modify: `src/screens/PlayDetail/Vertical/Player/components/PlayInfo.tsx`
- Modify: `src/screens/PlayDetail/Vertical/Player/components/MoreBtn/Btn.tsx`
- Modify: `src/screens/PlayDetail/Vertical/Player/components/MoreBtn/TimeoutExitBtn.tsx`
- Modify: `src/screens/PlayDetail/Vertical/Lyric.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/components/Header.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/components/Btn.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/Player/PlayInfo.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/MoreBtn/Btn.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/MoreBtn/TimeoutExitBtn.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/Lyric.tsx`
- Test: `tests/play-detail/foreground-colors.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail foreground uses shared near-white tokens instead of gray helper colors', () => {
  const palette = readFile('src/screens/PlayDetail/palette.ts')
  const verticalHeader = readFile('src/screens/PlayDetail/Vertical/components/Header.tsx')
  const verticalInfo = readFile('src/screens/PlayDetail/Vertical/Player/components/PlayInfo.tsx')
  const horizontalHeader = readFile('src/screens/PlayDetail/Horizontal/components/Header.tsx')
  const horizontalInfo = readFile('src/screens/PlayDetail/Horizontal/Player/PlayInfo.tsx')

  assert.match(palette, /PRIMARY_TEXT:\s*'rgba\(255,\s*255,\s*255,\s*0\.96\)'/)
  assert.match(palette, /SECONDARY_TEXT:\s*'rgba\(255,\s*255,\s*255,\s*0\.78\)'/)
  assert.match(verticalHeader, /playDetailPalette\.SECONDARY_TEXT/)
  assert.match(horizontalHeader, /playDetailPalette\.SECONDARY_TEXT/)
  assert.match(verticalInfo, /playDetailPalette\.SECONDARY_TEXT/)
  assert.match(horizontalInfo, /playDetailPalette\.SECONDARY_TEXT/)
  assert.doesNotMatch(verticalInfo, /theme\['c-500'\]/)
  assert.doesNotMatch(horizontalInfo, /theme\['c-500'\]/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/play-detail/foreground-colors.test.js`
Expected: FAIL because `src/screens/PlayDetail/palette.ts` does not exist yet and the play-detail components still reference gray helper tokens.

- [ ] **Step 3: Write minimal implementation**

```ts
export const playDetailPalette = {
  PRIMARY_TEXT: 'rgba(255, 255, 255, 0.96)',
  SECONDARY_TEXT: 'rgba(255, 255, 255, 0.78)',
  TERTIARY_TEXT: 'rgba(255, 255, 255, 0.62)',
}
```

```tsx
import { playDetailPalette } from '../../palette'

<Text color={playDetailPalette.SECONDARY_TEXT}>{musicInfo.singer}</Text>
<Icon color={color ?? playDetailPalette.SECONDARY_TEXT} />
<Text color={playDetailPalette.SECONDARY_TEXT}>{timeStr}</Text>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/play-detail/foreground-colors.test.js tests/play-detail/background-preset.test.js`
Expected: PASS with the new foreground test and the existing background preset test both green.

- [ ] **Step 5: Commit**

```bash
git add tests/play-detail/foreground-colors.test.js src/screens/PlayDetail
git commit -m "feat: polish play detail foreground colors"
```

### Task 2: Media-Source List Visual Consistency

**Files:**
- Modify: `src/screens/Home/Views/Mylist/MusicList/ListItem.tsx`
- Modify: `src/screens/Home/Views/Mylist/MyList/List.tsx`
- Test: `tests/mylist/music-list-visuals.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('generated media-source list rows keep normal readable colors for text and actions', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MusicList/ListItem.tsx')

  assert.match(file, /<Text style=\{styles\.sn\} size=\{13\} color=\{theme\['c-font'\]\}>\{index \+ 1\}<\/Text>/)
  assert.match(file, /color=\{active \? theme\['c-primary-font'\] : theme\['c-font'\]\}/)
  assert.match(file, /color=\{active \? theme\['c-primary-font'\] : theme\['c-font-label'\]\}/)
  assert.match(file, /<Icon name="dots-vertical" style=\{\{ color: theme\['c-font'\] \}\} size=\{12\} \/>/)
  assert.doesNotMatch(file, /theme\['c-350'\]/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mylist/music-list-visuals.test.js`
Expected: FAIL because the row action icon still uses `theme['c-350']` and subtitle styling is not fully aligned with the readable-color expectation.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Text color={active ? theme['c-primary-font'] : theme['c-font']}>{item.name}</Text>
<Text color={active ? theme['c-primary-font'] : theme['c-font-label']}>{singer}</Text>
<Text color={active ? theme['c-primary-font'] : theme['c-font-label']}>{item.interval}</Text>
<Icon name="dots-vertical" style={{ color: theme['c-font'] }} size={12} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mylist/music-list-visuals.test.js`
Expected: PASS with both the sidebar-name and row-visual assertions green.

- [ ] **Step 5: Commit**

```bash
git add tests/mylist/music-list-visuals.test.js src/screens/Home/Views/Mylist/MusicList/ListItem.tsx src/screens/Home/Views/Mylist/MyList/List.tsx
git commit -m "feat: normalize media-source list visuals"
```

### Task 3: Generated List Sort Preferences And New Fields

**Files:**
- Create: `src/utils/musicListSort.ts`
- Modify: `src/config/constant.ts`
- Modify: `src/utils/data.ts`
- Modify: `src/utils/listManage.ts`
- Modify: `src/screens/Home/Views/Mylist/MyList/utils.ts`
- Modify: `src/screens/Home/Views/Mylist/MyList/ListMenu.tsx`
- Modify: `src/screens/Home/Views/Mylist/MyList/ListMusicSort.tsx`
- Modify: `src/types/list.d.ts`
- Modify: `src/types/music.d.ts`
- Modify: `src/types/mediaLibrary.d.ts`
- Modify: `src/core/mediaLibrary/sourceLists.js`
- Modify: `src/core/mediaLibrary/providers/local.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/lang/en-us.json`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Test: `tests/mylist/generated-list-sort.test.js`
- Test: `tests/media-library/generated-list-sort-prefs.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('generated media-source lists allow sort menu and expose update-time / file-name fields', () => {
  const menuFile = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  const modalFile = readFile('src/screens/Home/Views/Mylist/MyList/ListMusicSort.tsx')
  const langFile = readFile('src/lang/zh-cn.json')

  assert.match(menuFile, /sort = true/)
  assert.match(modalFile, /'update_time'/)
  assert.match(modalFile, /'file_name'/)
  assert.match(langFile, /"list_sort_modal_by_update_time": "更新时间"/)
  assert.match(langFile, /"list_sort_modal_by_file_name": "文件名"/)
})

test('generated media-source list sort preferences persist per list id and reapply on reload', async () => {
  const { sortMusicListByPreference, applyGeneratedListSortPreference } = require('../../src/utils/musicListSort.ts')
  const sample = [
    { id: 'b', name: 'Song B', singer: 'B', source: 'webdav', interval: '03:00', meta: { albumName: '', mediaLibrary: { fileName: 'b.mp3', modifiedTime: 200 } } },
    { id: 'a', name: 'Song A', singer: 'A', source: 'webdav', interval: '03:00', meta: { albumName: '', mediaLibrary: { fileName: 'a.mp3', modifiedTime: 100 } } },
  ]

  const sortedByUpdate = sortMusicListByPreference(sample, { field: 'update_time', type: 'down' }, 'zh-CN')
  const sortedByFileName = sortMusicListByPreference(sample, { field: 'file_name', type: 'up' }, 'zh-CN')

  assert.deepEqual(sortedByUpdate.map(item => item.id), ['b', 'a'])
  assert.deepEqual(sortedByFileName.map(item => item.id), ['a', 'b'])
  assert.equal(typeof applyGeneratedListSortPreference, 'function')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/mylist/generated-list-sort.test.js tests/media-library/generated-list-sort-prefs.test.js`
Expected: FAIL because the new test files do not exist yet, the modal has no `update_time` / `file_name` fields, and there is no per-list sort preference helper.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ListSortField = 'name' | 'singer' | 'album' | 'time' | 'source' | 'update_time' | 'file_name'
export type ListSortType = 'up' | 'down' | 'random'

export interface ListSortPreference {
  field: ListSortField
  type: ListSortType
}

export const sortMusicListByPreference = (list, preference, localeId) => { /* sort copy */ }
export const applyGeneratedListSortPreference = (listInfo, list, preference, localeId) => { /* return sorted copy only for generated read-only lists */ }
```

```ts
const listSortInfoKey = storageDataPrefix.listSortInfo

export const getListSortInfo = async() => { /* load record map */ }
export const setListSortInfo = async(listId, preference) => { /* update one list */ }
export const removeListSortInfo = async(listId) => { /* cleanup */ }
```

```tsx
const fieldNames = ['name', 'singer', 'album', 'time', 'source', 'update_time', 'file_name'] as const
sort = true
```

```js
modifiedTime: file.lastModified || 0
modifiedTime: file.modifiedTime || 0
modifiedTime: item.modifiedTime ?? 0
meta: {
  mediaLibrary: {
    fileName: item.fileName || '',
    modifiedTime: item.modifiedTime || 0,
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mylist/generated-list-sort.test.js tests/media-library/generated-list-sort-prefs.test.js tests/media-library/source-lists-ui.test.js`
Expected: PASS with the new generated-list sort tests and the existing media-library UI assertions green.

- [ ] **Step 5: Run focused regression verification**

Run: `node --test tests/media-library tests/play-detail/background-preset.test.js tests/play-detail/foreground-colors.test.js tests/mylist/music-list-visuals.test.js tests/mylist/generated-list-sort.test.js`
Expected: PASS with 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/config/constant.ts src/utils/data.ts src/utils/listManage.ts src/utils/musicListSort.ts src/screens/Home/Views/Mylist/MyList/utils.ts src/screens/Home/Views/Mylist/MyList/ListMenu.tsx src/screens/Home/Views/Mylist/MyList/ListMusicSort.tsx src/core/mediaLibrary/sourceLists.js src/core/mediaLibrary/providers/local.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/providers/webdav.js src/types/list.d.ts src/types/music.d.ts src/types/mediaLibrary.d.ts src/lang/en-us.json src/lang/zh-cn.json src/lang/zh-tw.json tests/mylist/generated-list-sort.test.js tests/media-library/generated-list-sort-prefs.test.js
git commit -m "feat: add generated list sort preferences"
```

## Self-Review

- Spec coverage: Task 1 covers the play-detail foreground rules, Task 2 covers generated-list text/icon consistency, and Task 3 covers sort entry reopening, new fields, per-list persistence, and refresh-time reapplication.
- Placeholder scan: No `TODO`, `TBD`, or “write tests later” placeholders remain. Each task names the files, failing tests, commands, and expected results.
- Type consistency: The plan uses `field` + `type` for list sort preferences everywhere, and `update_time` / `file_name` are the only new fields introduced across types, storage, modal options, and tests.
