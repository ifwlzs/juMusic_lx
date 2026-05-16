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

// 继续直接执行任务 1 已交付的纯函数，避免相关歌曲匹配规则被 UI 层测试掩盖。
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

// 统一读取语言文件，继续保留文案静态断言，避免交互测试遗漏翻译键。
const readLanguage = languagePath => {
  return JSON.parse(fs.readFileSync(languagePath, 'utf8'))
}

// 把 JSX children 归一化为数组，便于后续遍历 SearchTipList 宿主节点。
const normalizeRenderedChildren = children => {
  if (children === null || children === undefined || children === false) return []
  if (Array.isArray(children)) return children.flatMap(normalizeRenderedChildren)
  return [children]
}

// 递归执行函数组件，得到最小宿主节点树，供测试直接触发背景点击与 ref 调用。
const resolveRenderedNode = node => {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) return node.map(resolveRenderedNode).flat().filter(item => item !== null)
  if (typeof node !== 'object') return node
  if (typeof node.type === 'function') return resolveRenderedNode(node.type(node.props ?? {}))
  const props = { ...(node.props ?? {}) }
  props.children = normalizeRenderedChildren(props.children).map(resolveRenderedNode).flat().filter(item => item !== null)
  return { type: node.type, props }
}

// 把节点树拍平后，测试可以按 SearchTipList / View 等宿主类型查找目标节点。
const flattenRenderedNodes = node => {
  if (node === null || node === undefined) return []
  if (Array.isArray(node)) return node.flatMap(flattenRenderedNodes)
  if (typeof node !== 'object') return []
  return [node, ...normalizeRenderedChildren(node.props?.children).flatMap(flattenRenderedNodes)]
}

// 用简单事件总线模拟全局事件系统，驱动列表更新订阅回调。
const createEventEmitter = () => {
  const listeners = new Map()
  return {
    emit(eventName, payload) {
      for (const listener of [...(listeners.get(eventName) ?? [])]) listener(payload)
    },
    off(eventName, listener) {
      const target = listeners.get(eventName)
      if (!target) return
      target.delete(listener)
      if (!target.size) listeners.delete(eventName)
    },
    on(eventName, listener) {
      const target = listeners.get(eventName) ?? new Set()
      target.add(listener)
      listeners.set(eventName, target)
    },
  }
}

// ListMusicSearch 的行为测试需要一个最小 hooks/host runtime，既能跑 imperative ref，也能记录 SearchTipList 的真实交互轨迹。
let currentListMusicSearchTestRuntime = null

const getListMusicSearchTestRuntime = () => {
  assert.ok(currentListMusicSearchTestRuntime, 'ListMusicSearch 测试运行时尚未初始化')
  return currentListMusicSearchTestRuntime
}

// 构造最小渲染器：支持 ref、state、effect、requestAnimationFrame 与宿主节点查询。
const createListMusicSearchTestRenderer = component => {
  const hookStates = []
  const ref = { current: null }
  const rafQueue = []
  const effectQueue = []
  const previousRuntime = currentListMusicSearchTestRuntime
  const previousRequestAnimationFrame = global.requestAnimationFrame
  let hookIndex = 0
  let tree = null
  let needsRender = false

  const isSameDeps = (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right)) return left === right
    if (left.length !== right.length) return false
    return left.every((value, index) => Object.is(value, right[index]))
  }

  const runtime = {
    queryRefWrites: [],
    searchTipListSetHeightCalls: [],
    searchTipListSetListCalls: [],
    createElement(type, props = {}, key) {
      return key === undefined ? { type, props } : { type, props: { ...props, key } }
    },
    createHostNode(type, props = {}) {
      if (type === 'SearchTipList' && props.ref && typeof props.ref === 'object') {
        props.ref.current = {
          setHeight: height => {
            runtime.searchTipListSetHeightCalls.push(height)
          },
          setList: list => {
            runtime.searchTipListSetListCalls.push(list)
          },
        }
      }
      return { type, props }
    },
    useEffect(effect, deps) {
      const stateIndex = hookIndex++
      const previous = hookStates[stateIndex]
      if (previous && isSameDeps(previous.deps, deps)) return
      effectQueue.push(() => {
        previous?.cleanup?.()
        hookStates[stateIndex] = {
          deps: Array.isArray(deps) ? [...deps] : deps,
          cleanup: effect() ?? null,
        }
      })
    },
    useImperativeHandle(targetRef, create, deps) {
      const stateIndex = hookIndex++
      const previous = hookStates[stateIndex]
      if (previous && isSameDeps(previous.deps, deps)) return
      if (targetRef && typeof targetRef === 'object') targetRef.current = create()
      hookStates[stateIndex] = {
        deps: Array.isArray(deps) ? [...deps] : deps,
      }
    },
    useRef(initialValue) {
      const stateIndex = hookIndex++
      if (!(stateIndex in hookStates)) {
        let currentValue = initialValue
        const refObject = {}
        Object.defineProperty(refObject, 'current', {
          enumerable: true,
          get() {
            return currentValue
          },
          set(nextValue) {
            currentValue = nextValue
            // 仅记录 query 上下文写入，供“统一入口只提交一次 artist query”断言复用。
            if (nextValue && typeof nextValue === 'object' && (nextValue.type === 'keyword' || nextValue.type === 'artist')) {
              runtime.queryRefWrites.push(nextValue)
            }
          },
        })
        hookStates[stateIndex] = refObject
      }
      return hookStates[stateIndex]
    },
    useState(initialValue) {
      const stateIndex = hookIndex++
      if (!(stateIndex in hookStates)) {
        hookStates[stateIndex] = typeof initialValue === 'function' ? initialValue() : initialValue
      }
      return [
        hookStates[stateIndex],
        nextValue => {
          hookStates[stateIndex] = typeof nextValue === 'function'
            ? nextValue(hookStates[stateIndex])
            : nextValue
          needsRender = true
        },
      ]
    },
  }

  const rerender = () => {
    currentListMusicSearchTestRuntime = runtime
    hookIndex = 0
    effectQueue.length = 0
    tree = resolveRenderedNode(component({ onScrollToInfo: () => {} }, ref))
    while (effectQueue.length) {
      const effect = effectQueue.shift()
      effect?.()
    }
    return tree
  }

  global.requestAnimationFrame = callback => {
    rafQueue.push(callback)
    return rafQueue.length
  }

  const flushAnimationFrames = () => {
    if (needsRender) {
      needsRender = false
      rerender()
    }
    while (rafQueue.length) {
      const callback = rafQueue.shift()
      callback?.()
      if (needsRender) {
        needsRender = false
        rerender()
      }
    }
  }

  const cleanup = () => {
    currentListMusicSearchTestRuntime = previousRuntime
    for (const state of hookStates) state?.cleanup?.()
    if (previousRequestAnimationFrame === undefined) {
      delete global.requestAnimationFrame
      return
    }
    global.requestAnimationFrame = previousRequestAnimationFrame
  }

  rerender()

  return {
    ref,
    rerender,
    cleanup,
    flushAnimationFrames,
    findAllByType: type => flattenRenderedNodes(tree).filter(node => node.type === type),
    getQueryRefWrites: () => [...runtime.queryRefWrites],
    getSearchTipListSetHeightCalls: () => [...runtime.searchTipListSetHeightCalls],
    getSearchTipListSetListCalls: () => [...runtime.searchTipListSetListCalls],
  }
}

// 通过转译加载 ListMusicSearch，并用最小依赖桩执行真实 show / search / 背景点击 / 订阅刷新链路。
const loadListMusicSearchModule = ({
  listActionModule = loadListActionModule(),
  getListMusics,
  listState,
  toastMessages,
  translations,
} = {}) => {
  const source = fs.readFileSync(listMusicSearchPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: listMusicSearchPath,
  }).outputText

  const mod = new Module(listMusicSearchPath, module)
  mod.filename = listMusicSearchPath
  mod.paths = Module._nodeModulePaths(path.dirname(listMusicSearchPath))
  mod.require = request => {
    switch (request) {
      case 'react':
        return {
          forwardRef: render => render,
          useEffect: (effect, deps) => getListMusicSearchTestRuntime().useEffect(effect, deps),
          useImperativeHandle: (targetRef, create, deps) => getListMusicSearchTestRuntime().useImperativeHandle(targetRef, create, deps),
          useRef: value => getListMusicSearchTestRuntime().useRef(value),
          useState: initialValue => getListMusicSearchTestRuntime().useState(initialValue),
        }
      case 'react/jsx-runtime':
        return {
          jsx: (type, props, key) => getListMusicSearchTestRuntime().createElement(type, props, key),
          jsxs: (type, props, key) => getListMusicSearchTestRuntime().createElement(type, props, key),
          Fragment: 'Fragment',
        }
      case '@/components/SearchTipList':
        return function MockSearchTipList(props) {
          return getListMusicSearchTestRuntime().createHostNode('SearchTipList', props)
        }
      case '@/utils':
        return {
          // 关键字模式行为测试只关心“是否按原 query 继续刷新”，这里把防抖退化成同步调用即可。
          debounce: fn => fn,
        }
      case './listAction':
        return listActionModule
      case '@/components/common/Button':
        return function MockButton(props) {
          return getListMusicSearchTestRuntime().createHostNode('Button', props)
        }
      case '@/components/common/Text':
        return function MockText(props) {
          return getListMusicSearchTestRuntime().createHostNode('Text', props)
        }
      case '@/utils/tools':
        return {
          createStyle: styles => styles,
          toast: message => {
            toastMessages.push(message)
          },
        }
      case '@/store/theme/hook':
        return {
          useTheme: () => ({
            'c-font': '#fff',
          }),
        }
      case 'react-native':
        return {
          View: function MockView(props) {
            return getListMusicSearchTestRuntime().createHostNode('View', props)
          },
        }
      case '@/utils/pixelRatio':
        return {
          scaleSizeH: value => value,
        }
      case '@/core/list':
        return {
          getListMusics,
        }
      case '@/store/list/state':
        return listState
      default:
        throw new Error(`Unexpected dependency: ${request}`)
    }
  }

  mod._compile(transpiled, listMusicSearchPath)
  mod.exports.__createTestRenderer = () => createListMusicSearchTestRenderer(mod.exports.default)
  return mod.exports
}

// 把 ListMusicSearch 的依赖与全局对象统一封装成 harness，便于各行为测试只关注输入与结果。
const createListMusicSearchHarness = (initialList = []) => {
  const listsById = new Map([['list_1', initialList]])
  const toastMessages = []
  const getListMusicsCalls = []
  const stateEvent = createEventEmitter()
  const appEvent = createEventEmitter()
  const listState = { activeListId: 'list_1' }
  const translations = {
    music_detail_artist_related_empty: '当前列表未找到该歌手相关歌曲',
  }
  const previousStateEvent = global.state_event
  const previousAppEvent = global.app_event
  const previousI18n = global.i18n

  global.state_event = stateEvent
  global.app_event = appEvent
  global.i18n = {
    t(key) {
      return translations[key] ?? key
    },
  }

  const moduleExports = loadListMusicSearchModule({
    listActionModule: loadListActionModule(),
    getListMusics: async id => {
      getListMusicsCalls.push(id)
      return listsById.get(id) ?? []
    },
    listState,
    toastMessages,
    translations,
  })
  const renderer = moduleExports.__createTestRenderer()

  const cleanup = () => {
    renderer.cleanup()
    if (previousStateEvent === undefined) delete global.state_event
    else global.state_event = previousStateEvent
    if (previousAppEvent === undefined) delete global.app_event
    else global.app_event = previousAppEvent
    if (previousI18n === undefined) delete global.i18n
    else global.i18n = previousI18n
  }

  return {
    cleanup,
    emitListUpdate() {
      appEvent.emit('myListMusicUpdate', [listState.activeListId])
    },
    emitListToggle() {
      stateEvent.emit('mylistToggled', listState.activeListId)
    },
    getListMusicsCalls,
    listState,
    renderer,
    setActiveList(listId) {
      listState.activeListId = listId
    },
    setList(listId, list) {
      listsById.set(listId, list)
    },
    toastMessages,
  }
}

// 统一等待 Promise.then 链路完成，驱动 getListMusics -> 搜索/筛选 -> setList 的异步更新。
const flushAsyncWork = async() => {
  await Promise.resolve()
  await Promise.resolve()
}

// 统一提取 SearchTipList 最近一次写入的歌曲 id，减少每个用例里的样板代码。
const getLastSetListIds = renderer => {
  const lastCall = renderer.getSearchTipListSetListCalls().at(-1) ?? []
  return lastCall.map(item => item.id)
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

test('ListMusicSearch 的 artist 模式初次无结果时只 toast 一次并清理旧查询状态', async() => {
  const harness = createListMusicSearchHarness([
    { id: 'song_1', name: '海阔天空', singer: 'Beyond', source: 'kg', meta: { albumName: '乐与怒' } },
  ])

  try {
    assert.equal(typeof harness.renderer.ref.current?.showArtistRelatedSongs, 'function')

    harness.renderer.ref.current.showArtistRelatedSongs('周杰伦', 260)
    harness.renderer.flushAnimationFrames()
    await flushAsyncWork()

    // 初次 artist 无结果时仍然只提示一次，并且 clearSearchState 会把结果浮层收口成空列表。
    assert.deepEqual(harness.toastMessages, ['当前列表未找到该歌手相关歌曲'])
    assert.deepEqual(getLastSetListIds(harness.renderer), [])

    const getListMusicsCallCount = harness.getListMusicsCalls.length
    const setListCallCount = harness.renderer.getSearchTipListSetListCalls().length

    harness.emitListUpdate()
    await flushAsyncWork()

    // 查询状态已清空后，列表更新不应再拿旧 artist query 重新刷新或重复 toast。
    assert.equal(harness.toastMessages.length, 1)
    assert.equal(harness.getListMusicsCalls.length, getListMusicsCallCount)
    assert.equal(harness.renderer.getSearchTipListSetListCalls().length, setListCallCount)
  } finally {
    harness.cleanup()
  }
})

test('ListMusicSearch 的 keyword 模式背景点击后仅隐藏结果，列表更新仍沿用原 keyword 刷新', async() => {
  const harness = createListMusicSearchHarness([
    { id: 'song_keyword_1', name: '晴天', singer: '周杰伦', source: 'kg', meta: { albumName: '叶惠美' } },
    { id: 'song_keyword_2', name: '稻香', singer: '周杰伦', source: 'kg', meta: { albumName: '魔杰座' } },
  ])

  try {
    assert.equal(typeof harness.renderer.ref.current?.search, 'function')

    harness.renderer.ref.current.search('晴', 320)
    harness.renderer.flushAnimationFrames()
    await flushAsyncWork()

    assert.deepEqual(getLastSetListIds(harness.renderer), ['song_keyword_1'])
    assert.equal(harness.renderer.getSearchTipListSetHeightCalls().at(-1), 320)

    const searchTipList = harness.renderer.findAllByType('SearchTipList')[0]
    assert.ok(searchTipList, 'keyword 模式渲染后缺少 SearchTipList 宿主节点')

    searchTipList.props.onPressBg()
    assert.deepEqual(getLastSetListIds(harness.renderer), [])

    // 修改当前列表后触发更新，若 keyword query 仍被保留，就会继续按原关键字刷新出新结果。
    harness.setList('list_1', [
      { id: 'song_keyword_3', name: '晴天 2025', singer: '周杰伦', source: 'kg', meta: { albumName: '现场版' } },
    ])
    const beforeRefreshCalls = harness.getListMusicsCalls.length

    harness.emitListUpdate()
    await flushAsyncWork()

    assert.equal(harness.getListMusicsCalls.length, beforeRefreshCalls + 1)
    assert.deepEqual(getLastSetListIds(harness.renderer), ['song_keyword_3'])
    // 刷新时没有重新传高度参数，仍然能沿用旧高度，说明 keyword 上下文没有被背景点击清掉。
    assert.equal(harness.renderer.getSearchTipListSetHeightCalls().at(-1), 320)
  } finally {
    harness.cleanup()
  }
})

test('ListMusicSearch 的 artist 模式背景点击后会清理查询状态，列表更新不再继续刷新', async() => {
  const harness = createListMusicSearchHarness([
    { id: 'song_artist_1', name: '海阔天空', singer: 'Beyond', source: 'kg', meta: { albumName: '乐与怒' } },
  ])

  try {
    harness.renderer.ref.current.showArtistRelatedSongs('Beyond', 280)
    harness.renderer.flushAnimationFrames()
    await flushAsyncWork()

    assert.deepEqual(getLastSetListIds(harness.renderer), ['song_artist_1'])

    const searchTipList = harness.renderer.findAllByType('SearchTipList')[0]
    assert.ok(searchTipList, 'artist 模式渲染后缺少 SearchTipList 宿主节点')

    searchTipList.props.onPressBg()
    assert.deepEqual(getLastSetListIds(harness.renderer), [])

    const beforeRefreshCalls = harness.getListMusicsCalls.length
    const beforeSetListCalls = harness.renderer.getSearchTipListSetListCalls().length

    harness.setList('list_1', [
      { id: 'song_artist_2', name: '光辉岁月', singer: 'Beyond', source: 'kg', meta: { albumName: '命运派对' } },
    ])
    harness.emitListToggle()
    await flushAsyncWork()

    // artist 背景点击已清空查询状态，后续列表更新不应再触发 refresh。
    assert.equal(harness.getListMusicsCalls.length, beforeRefreshCalls)
    assert.equal(harness.renderer.getSearchTipListSetListCalls().length, beforeSetListCalls)
  } finally {
    harness.cleanup()
  }
})

test('ListMusicSearch 的 artist 模式只通过统一入口提交一次 query 状态', async() => {
  const harness = createListMusicSearchHarness([
    { id: 'song_artist_3', name: '喜欢你', singer: 'Beyond', source: 'kg', meta: { albumName: '秘密警察' } },
  ])

  try {
    harness.renderer.ref.current.showArtistRelatedSongs('Beyond', 300)
    harness.renderer.flushAnimationFrames()
    await flushAsyncWork()

    // 这里通过 hooks runtime 记录 query ref 的真实写入次数，确保 artist query 不会在 showArtistRelatedSongs 与统一入口各写一遍。
    const artistQueryWrites = harness.renderer.getQueryRefWrites().filter(value => value.type === 'artist' && value.value === 'Beyond')
    assert.equal(artistQueryWrites.length, 1)
  } finally {
    harness.cleanup()
  }
})

test('三份语言文件包含歌手相关歌曲模式的空结果提示文案', () => {
  // 三份语言文案是任务 2 的静态契约之一，避免 UI 出现缺失 key。
  assert.equal(readLanguage(zhCnPath).music_detail_artist_related_empty, '当前列表未找到该歌手相关歌曲')
  assert.equal(readLanguage(zhTwPath).music_detail_artist_related_empty, '目前清單未找到該歌手相關歌曲')
  assert.equal(readLanguage(enUsPath).music_detail_artist_related_empty, 'No related songs from this artist were found in the current list')
})
