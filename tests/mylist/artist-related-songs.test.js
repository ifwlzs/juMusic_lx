const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const listActionPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/listAction.ts')
const listMusicSearchPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/ListMusicSearch.tsx')
const zhCnPath = path.resolve(__dirname, '../../src/lang/zh-cn.json')
const zhTwPath = path.resolve(__dirname, '../../src/lang/zh-tw.json')
const enUsPath = path.resolve(__dirname, '../../src/lang/en-us.json')

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

// 直接读取搜索浮层源码，做任务 2 需要的静态契约校验，确保后续实现与任务 3 的接口约定一致。
const readListMusicSearchSource = () => {
  return fs.readFileSync(listMusicSearchPath, 'utf8')
}

// 统一读取语言文件，避免多份断言重复写文件解析逻辑。
const readLanguage = languagePath => {
  return JSON.parse(fs.readFileSync(languagePath, 'utf8'))
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

test('ListMusicSearch 为歌手相关歌曲模式暴露约定接口与查询上下文', () => {
  const source = readListMusicSearchSource()

  // 搜索浮层对外必须新增歌手模式入口，供后续详情弹窗任务直接调用。
  assert.match(source, /showArtistRelatedSongs:\s*\(artist:\s*string,\s*height:\s*number\)\s*=>\s*void/)

  // 搜索上下文必须统一成双模式联合类型，避免关键词模式与歌手模式分叉失控。
  assert.match(
    source,
    /type\s+SearchQuery\s*=\s*\{\s*type:\s*'keyword',\s*value:\s*string\s*\}\s*\|\s*\{\s*type:\s*'artist',\s*value:\s*string\s*\}/
  )

  // 歌手模式必须把当前查询写入 ref，方便列表更新后复算同一查询。
  assert.match(source, /currentQueryRef\.current\s*=\s*\{\s*type:\s*'artist',\s*value:\s*artist\s*\}/)
})

test('ListMusicSearch 为歌手模式复用列表筛选与空结果提示约定', () => {
  const source = readListMusicSearchSource()

  // 歌手模式必须复用任务 1 已完成的完整歌手匹配函数，保持规则一致。
  assert.match(source, /findArtistRelatedSongsInList\(list,\s*query\.value\)/)

  // 初次触发歌手模式且无结果时，必须弹出指定国际化文案提示。
  assert.match(source, /toast\(global\.i18n\.t\('music_detail_artist_related_empty'\)\)/)

  // artist 模式无结果时必须清空当前查询状态并收起，避免后续列表更新又被旧查询重新顶开。
  assert.match(source, /if\s*\(!result\.length\)\s*\{[\s\S]*?if\s*\(showEmptyArtistToast\)\s*\{[\s\S]*?toast\(global\.i18n\.t\('music_detail_artist_related_empty'\)\)[\s\S]*?\}[\s\S]*?clearSearchState\(\)\s*return\s*\}/)
})

test('三份语言文件包含歌手相关歌曲模式的空结果提示文案', () => {
  // 三份语言文案是任务 2 的静态契约之一，避免 UI 出现缺失 key。
  assert.equal(readLanguage(zhCnPath).music_detail_artist_related_empty, '当前列表未找到该歌手相关歌曲')
  assert.equal(readLanguage(zhTwPath).music_detail_artist_related_empty, '目前清單未找到該歌手相關歌曲')
  assert.equal(readLanguage(enUsPath).music_detail_artist_related_empty, 'No related songs from this artist were found in the current list')
})
