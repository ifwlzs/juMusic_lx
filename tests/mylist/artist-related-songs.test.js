const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const listActionPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/listAction.ts')

// 参考现有测试的转译加载方式，直接执行 TS 模块里的纯函数导出，避免只做源码字符串断言。
const loadListActionModule = () => {
  const source = fs.readFileSync(listActionPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: listActionPath,
  }).outputText

  const mod = new Module(listActionPath, module)
  mod.filename = listActionPath
  mod.paths = Module._nodeModulePaths(path.dirname(listActionPath))
  mod.require = request => {
    switch (request) {
      case '@/core/list':
        return {
          addListMusics: async() => {},
          removeListMusics: async() => {},
          updateListMusicPosition: async() => {},
          updateListMusics: async() => {},
        }
      case '@/core/player/player':
        return {
          playList: async() => {},
          playListById: async() => {},
          playNext: async() => {},
        }
      case '@/core/player/tempPlayList':
        return {
          addTempPlayList: () => {},
        }
      case '@/store/setting/state':
        return {
          setting: {
            'common.shareType': 'text',
            'download.fileName': '{name}',
            'list.addMusicLocationType': 'bottom',
          },
        }
      case '@/utils':
        return {
          similar: () => 0,
          sortInsert: (target, item) => target.push(item),
          toOldMusicInfo: info => info,
        }
      case '@/utils/tools':
        return {
          confirmDialog: async() => false,
          openUrl: () => {},
          shareMusic: () => {},
          toast: () => {},
        }
      case '@/core/dislikeList':
        return {
          addDislikeInfo: async() => {},
          hasDislike: () => false,
        }
      case '@/store/player/state':
        return {
          playMusicInfo: {
            listId: '',
            musicInfo: null,
          },
        }
      case '@/store/list/state':
        return {
          allList: [],
        }
      case '@/utils/musicSdk':
        return {}
      case '@/utils/listManage':
        return {
          getListMusicSync: () => [],
        }
      default:
        throw new Error(`Unexpected dependency: ${request}`)
    }
  }

  mod._compile(transpiled, listActionPath)
  return mod.exports
}

test('findArtistRelatedSongsInList 仅按首尾空白裁剪后做完整字符串匹配', () => {
  const { findArtistRelatedSongsInList } = loadListActionModule()
  const list = [
    { id: 'song_1', singer: 'Beyond', name: '海阔天空' },
    { id: 'song_2', singer: 'Beyond', name: '光辉岁月' },
    { id: 'song_3', singer: 'Beyond / 黄家驹', name: '真的爱你' },
    { id: 'song_4', singer: '黄家驹', name: '喜欢你' },
  ]

  // 只验证完整字符串全等匹配，不拆分联名歌手，结果必须保持原列表顺序。
  assert.deepEqual(findArtistRelatedSongsInList(list, ' Beyond ').map(item => item.id), ['song_1', 'song_2'])
  assert.deepEqual(findArtistRelatedSongsInList(list, 'Beyond / 黄家驹').map(item => item.id), ['song_3'])
  assert.deepEqual(findArtistRelatedSongsInList(list, 'Beyond;黄家驹').map(item => item.id), [])
  assert.deepEqual(findArtistRelatedSongsInList(list, '   ').map(item => item.id), [])
})

test('findArtistRelatedSongsInList 会对列表项 singer 做首尾空白裁剪', () => {
  const { findArtistRelatedSongsInList } = loadListActionModule()
  const list = [
    { id: 'song_5', singer: ' Beyond ', name: '灰色轨迹' },
    { id: 'song_6', singer: '黄家驹', name: '喜欢你' },
  ]

  // 列表项的 singer 也必须先裁剪，再参与完整字符串全等匹配。
  assert.deepEqual(findArtistRelatedSongsInList(list, 'Beyond').map(item => item.id), ['song_5'])
})
