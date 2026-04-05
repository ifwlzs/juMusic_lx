const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')
const listManagePath = path.resolve(__dirname, '../../src/utils/listManage.ts')

const loadListManageModule = sharedState => {
  const source = fs.readFileSync(listManagePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: listManagePath,
  }).outputText
  const mod = new Module(listManagePath, module)
  mod.filename = listManagePath
  mod.paths = Module._nodeModulePaths(path.dirname(listManagePath))
  const dataApi = {
    getUserLists: async() => [],
    getListMusics: async listId => sharedState.listStore.get(listId) ?? [],
    getListSortInfo: async listId => listId ? sharedState.sortInfo[listId] ?? null : { ...sharedState.sortInfo },
    overwriteListPosition: async() => {},
    overwriteListSortInfo: async() => {},
    overwriteListUpdateInfo: async() => {},
    removeListPosition: async() => {},
    removeListSortInfo: async() => {},
    removeListUpdateInfo: async() => {},
    peekListSortInfo: listId => sharedState.sortInfo[listId] ?? null,
    saveListSortInfo: async(listId, info) => {
      sharedState.sortInfo[listId] = info
    },
  }
  mod.require = request => {
    switch (request) {
      case '@/utils/data':
        return dataApi
      case '@/utils/common':
        return {
          arrPush: (target, list) => target.push(...list),
          arrPushByPosition: (target, list, position) => target.splice(position, 0, ...list),
          arrUnshift: (target, list) => target.unshift(...list),
        }
      case '@/config/constant':
        return {
          LIST_IDS: {
            DEFAULT: 'default',
            LOVE: 'love',
            TEMP: 'temp',
          },
        }
      case '@/utils/musicListSort':
        return require('../../src/utils/musicListSort.js')
      default:
        throw new Error(`Unexpected dependency: ${request}`)
    }
  }
  mod._compile(transpiled, listManagePath)
  return {
    dataApi,
    moduleExports: mod.exports,
  }
}

test('music list sort helper supports update-time and file-name ordering', () => {
  const { sortListMusicInfo, getDefaultSortType, applyGeneratedListSortPreference } = require('../../src/utils/musicListSort.js')

  const sourceListInfo = {
    id: 'media__conn__rule',
    name: 'Media',
    locationUpdateTime: null,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId: 'conn_1',
      kind: 'rule_directory',
    },
  }
  const songs = [
    {
      id: 'b',
      name: 'Song B',
      singer: 'Singer B',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'b.mp3',
          modifiedTime: 200,
        },
      },
    },
    {
      id: 'a',
      name: 'Song A',
      singer: 'Singer A',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'a.mp3',
          modifiedTime: 100,
        },
      },
    },
  ]

  assert.equal(getDefaultSortType('update_time'), 'down')
  assert.equal(getDefaultSortType('file_name'), 'up')
  assert.deepEqual(sortListMusicInfo([...songs], 'down', 'update_time', 'zh-CN').map(item => item.id), ['b', 'a'])
  assert.deepEqual(sortListMusicInfo([...songs], 'up', 'file_name', 'zh-CN').map(item => item.id), ['a', 'b'])
  assert.deepEqual(applyGeneratedListSortPreference(sourceListInfo, songs, { field: 'file_name', type: 'up' }, 'zh-CN').map(item => item.id), ['a', 'b'])
})

test('generated list sort preferences are persisted separately from media content and file metadata is preserved', () => {
  const dataFile = readFile('src/utils/data.ts')
  const constantFile = readFile('src/config/constant.ts')
  const sourceListsFile = readFile('src/core/mediaLibrary/sourceLists.js')
  const musicTypesFile = readFile('src/types/music.d.ts')
  const mediaLibraryTypesFile = readFile('src/types/mediaLibrary.d.ts')

  assert.match(constantFile, /listSortInfo: '@list_sort_info'/)
  assert.match(dataFile, /const listSortInfoKey = storageDataPrefix\.listSortInfo/)
  assert.match(dataFile, /export const getListSortInfo = async/)
  assert.match(dataFile, /export const saveListSortInfo = async/)
  assert.match(dataFile, /export const removeListSortInfo = async/)
  assert.match(dataFile, /export const overwriteListSortInfo = async/)

  assert.match(sourceListsFile, /fileName: item\.fileName \|\| ''/)
  assert.match(sourceListsFile, /modifiedTime: item\.modifiedTime \|\| 0/)
  assert.match(musicTypesFile, /fileName\?: string/)
  assert.match(musicTypesFile, /modifiedTime\?: number \| null/)
  assert.match(mediaLibraryTypesFile, /modifiedTime\?: number \| null/)
})

test('generated list sort ignores persisted random preference to avoid reshuffling on every reload', () => {
  const { applyGeneratedListSortPreference } = require('../../src/utils/musicListSort.js')

  const sourceListInfo = {
    id: 'media__conn__rule',
    name: 'Media',
    locationUpdateTime: null,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId: 'conn_1',
      kind: 'rule_directory',
    },
  }
  const songs = [
    {
      id: 'a',
      name: 'Song A',
      singer: 'Singer A',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'a.mp3',
          modifiedTime: 100,
        },
      },
    },
    {
      id: 'b',
      name: 'Song B',
      singer: 'Singer B',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'b.mp3',
          modifiedTime: 200,
        },
      },
    },
  ]

  const originalRandom = Math.random
  Math.random = () => 0
  try {
    assert.deepEqual(
      applyGeneratedListSortPreference(sourceListInfo, songs, { field: 'name', type: 'random' }, 'zh-CN').map(item => item.id),
      ['a', 'b'],
    )
  } finally {
    Math.random = originalRandom
  }
})

test('generated list sort preference reapplies through listManage after saving and simulated reload', async() => {
  const listId = 'media__conn__rule'
  const sourceListInfo = {
    id: listId,
    name: 'Media',
    locationUpdateTime: null,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId: 'conn_1',
      kind: 'rule_directory',
    },
  }
  const songs = [
    {
      id: 'b',
      name: 'Song B',
      singer: 'Singer B',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'b.mp3',
          modifiedTime: 200,
        },
      },
    },
    {
      id: 'a',
      name: 'Song A',
      singer: 'Singer A',
      source: 'webdav',
      interval: '03:00',
      meta: {
        albumName: '',
        mediaLibrary: {
          fileName: 'a.mp3',
          modifiedTime: 100,
        },
      },
    },
  ]
  const sharedState = {
    listStore: new Map([[listId, songs]]),
    sortInfo: {},
  }
  const prevI18n = global.i18n
  global.i18n = { locale: 'zh-CN' }

  try {
    const firstModule = loadListManageModule(sharedState)
    firstModule.moduleExports.setUserLists([sourceListInfo])
    firstModule.moduleExports.setMusicList(listId, songs)
    await firstModule.dataApi.saveListSortInfo(listId, { field: 'file_name', type: 'up' })

    const secondModule = loadListManageModule(sharedState)
    secondModule.moduleExports.setUserLists([sourceListInfo])
    const reloadedList = await secondModule.moduleExports.getListMusics(listId)

    assert.deepEqual(reloadedList.map(item => item.id), ['a', 'b'])
    assert.deepEqual(secondModule.moduleExports.getListMusicSync(listId).map(item => item.id), ['a', 'b'])
  } finally {
    global.i18n = prevI18n
  }
})
