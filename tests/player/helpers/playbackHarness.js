const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '../../..')
const noop = () => {}

// 中文注释：用显式闸门控制下载和原生操作的完成顺序，不依赖机器速度制造竞态。
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })
  return { promise, resolve, reject }
}

// 中文注释：保留真实业务模块及 setImmediate 事件调度，只隔离设备、文件、网络和持久化。
async function createPlaybackHarness({ cached = ['A', 'B', 'C'], playing = true, progress = true } = {}) {
  let now = 10_000
  let timerId = 0
  let nativeHook = async() => {}
  const timers = new Map()
  const modules = new Map()
  const mocks = new Map()
  const nativeListeners = new Map()
  const downloads = new Map()
  const caches = new Map()
  const files = new Set()
  const calls = []
  const native = { queue: [], index: 0, state: playing ? 'Playing' : 'Paused', position: 30, rate: 1 }
  const songs = ['A', 'B', 'C'].map(id => ({
    id,
    name: id,
    singer: '歌手',
    source: 'webdav',
    interval: '03:00',
    meta: { ext: 'mp3', mediaLibrary: { providerType: 'webdav', sourceItemId: id, connectionId: 'nas', versionToken: 'v1', remotePathOrUri: `/${id}.mp3` } },
  }))
  const setting = { setting: { 'player.togglePlayMethod': 'listLoop', 'player.playbackRate': 1.5, 'player.isSavePlayTime': false } }
  const globals = { lx: { gettingUrlId: '', suppressAutoAdvance: false, isPlayedStop: false, playerStatus: { isInitialized: true } }, i18n: { t: key => key } }
  const timer = {
    setTimeout(fn, ms = 0) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id },
    clearTimeout(id) { timers.delete(id) },
    // 中文注释：进度轮询与本次切歌断言无关，保留注册/取消接口而不主动推进周期任务。
    setInterval: () => ++timerId,
    clearInterval: noop,
  }
  class Clock extends Date { static now() { return now } }
  const context = vm.createContext({ global: globals, console: { log: noop, warn: noop, error: noop }, Date: Clock, setImmediate, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout })

  // 中文注释：按仓库相对路径缓存模块，确保循环依赖和共享状态与应用一致。
  function load(file) {
    file = file.replaceAll('\\', '/')
    if (mocks.has(file)) return mocks.get(file)
    if (modules.has(file)) return modules.get(file).exports
    const mod = { exports: {} }
    modules.set(file, mod)
    const filename = path.join(root, file)
    const source = fs.readFileSync(filename, 'utf8')
    const code = file.endsWith('.ts') ? ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText : source
    const requireModule = request => {
      if (mocks.has(request)) return mocks.get(request)
      const base = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.join(path.posix.dirname(file), request)
      const resolved = [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`].find(candidate => mocks.has(candidate) || (fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile()))
      if (!resolved) throw new Error(`未配置外部依赖 ${file}: ${request}`)
      return load(resolved)
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireModule, mod, mod.exports)
    return mod.exports
  }

  // 中文注释：原生事件先进入真实 service，再由真实应用事件总线异步通知状态与进度模块。
  const emitNative = async(name, payload) => {
    for (const listener of nativeListeners.get(name) || []) await listener(payload)
  }
  const setNativeState = async(state) => { native.state = state; await emitNative('PlaybackState', { state }) }
  const operation = async(name, args, action) => {
    calls.push({ name, args: Array.from(args) })
    await nativeHook(name, args)
    return action()
  }
  const trackPlayer = {
    getQueue: async() => Array.from(native.queue),
    getCurrentTrack: async() => native.queue.length ? native.index : null,
    getState: async() => native.state,
    getDuration: async() => 180,
    getPosition: async() => native.position,
    getBufferedPosition: async() => 180,
    add: async tracks => operation('add', tracks, async() => { native.queue.push(...tracks) }),
    // 中文注释：锁定依赖 LocalPlayback.remove 的契约：当前项保留，其他索引从后往前删除。
    remove: async indexes => operation('remove', indexes, async() => {
      const current = native.index
      for (const index of Array.from(indexes).sort((a, b) => b - a)) {
        if (index === current || index < 0 || index >= native.queue.length) continue
        native.queue.splice(index, 1)
        if (index < native.index) native.index--
      }
    }),
    skip: async index => operation('skip', [index], async() => {
      if (!native.queue[index]) throw new Error('index_out_of_bounds')
      const previous = native.index
      native.index = index
      native.position = 0
      await emitNative('PlaybackTrackChanged', { track: previous, nextTrack: index })
    }),
    reset: async() => operation('reset', [], async() => { native.queue = []; native.index = 0; await setNativeState('None') }),
    pause: async() => operation('pause', [], () => setNativeState('Paused')),
    stop: async() => operation('stop', [], async() => { native.position = 0; await setNativeState('None') }),
    play: async() => operation('play', [native.queue[native.index]?.musicId], () => setNativeState('Playing')),
    seekTo: async time => operation('seek', [native.queue[native.index]?.musicId, time], async() => { native.position = time }),
    setRate: async rate => operation('rate', [rate], async() => { native.rate = rate }),
    setRepeatMode: async() => {},
    updateNowPlayingMetadata: async() => {},
    addEventListener(name, listener) {
      nativeListeners.set(name, [...(nativeListeners.get(name) || []), listener])
      return { remove: noop }
    },
    registerPlaybackService: factory => factory()(),
  }
  const names = new Proxy({}, { get: (_, key) => key })
  mocks.set('react-native-track-player', { __esModule: true, default: trackPlayer, Event: names, State: names, RepeatMode: names, Capability: names })
  mocks.set('react-native-background-timer', timer)
  mocks.set('react-native', { AppState: { addEventListener: noop } })
  mocks.set('src/plugins/player/hook.ts', {})
  mocks.set('@/store/setting/state', setting)
  mocks.set('@/store/common/state', {})
  mocks.set('@/core/common', { exitApp: noop })
  mocks.set('@/config', {})
  mocks.set('@/config/constant', { LIST_IDS: {}, SPLIT_CHAR: { DISLIKE_NAME: '__', DISLIKE_NAME_ALIAS: '_' } })
  mocks.set('@/store/dislikeList', { state: { dislikeInfo: { names: new Set(), musicNames: new Set(), singerNames: new Set() } } })
  mocks.set('@/utils/listManage', { getListMusicSync: () => songs })
  mocks.set('@/utils', { arrPush: (arr, values) => arr.push(...values), arrUnshift: (arr, values) => arr.unshift(...values), formatPlayTime2: String })
  mocks.set('@/utils/common', { getRandom: () => 0, formatPlayTime2: String })
  mocks.set('@/utils/tools', { debounceBackgroundTimer: fn => fn, throttleBackgroundTimer: fn => fn, checkIgnoringBatteryOptimization: noop, checkNotificationPermission: async() => {}, isActive: () => true })
  mocks.set('@/utils/message', { requestMsg: { cancelRequest: 'cancelled', tooManyRequests: 'rate_limited' } })
  mocks.set('@/utils/data', { savePlayInfo: async() => {} })
  mocks.set('@/utils/nativeModules/utils', { onScreenStateChange: noop })
  mocks.set('@/core/list', { addListMusics: noop, removeListMusics: noop, updateListMusics: async() => {} })
  mocks.set('@/core/dislikeList', { addDislikeInfo: noop })
  mocks.set('@/core/mediaLibrary/analytics', { createAnalyticsRecorder: () => new Proxy({}, { get: () => noop }) })
  mocks.set('@/core/mediaLibrary/playbackAnalyticsRuntime', { playbackAnalyticsRuntime: { setPendingEndReason: noop, consumePendingEndReason: noop, setPendingEntryContext: noop, consumePendingEntryContext: () => ({}) } })
  mocks.set('@/utils/fs', { privateStorageDirectoryPath: '/private', mkdir: async() => {}, existsFile: async file => files.has(file), unlink: async file => { files.delete(file) } })
  mocks.set('@/utils/localMediaMetadata', { readLyric: async() => null, readPic: async() => null })
  mocks.set('src/core/music/local.ts', { parseLyric: value => value })
  mocks.set('src/core/music/utils.ts', { buildLyricInfo: () => ({ rawlrcInfo: {} }) })
  mocks.set('src/core/music/online.ts', {})
  mocks.set('src/core/music/download.ts', {})
  mocks.set('@/core/mediaLibrary/storage', {
    mediaLibraryRepository: {
      getConnections: async() => [{ connectionId: 'nas' }],
      findCacheBySourceItemId: async id => caches.get(id),
      getCaches: async() => Array.from(caches.values()),
      saveCaches: async entries => { caches.clear(); for (const entry of entries) caches.set(entry.sourceItemId, entry) },
      removeCaches: async ids => { for (const [id, cache] of caches) if (ids.includes(cache.cacheId)) caches.delete(id) },
    },
  })
  mocks.set('@/core/mediaLibrary/runtimeRegistry', {
    getMediaLibraryRuntimeRegistry: () => ({
      get: () => ({
        downloadToCache: async(connection, item, target) => {
          calls.push({ name: 'download', args: [item.sourceItemId] })
          if (downloads.has(item.sourceItemId)) await downloads.get(item.sourceItemId).promise
          files.add(target)
          return { statusCode: 200, bytesWritten: 1024 }
        },
      }),
    }),
  })
  const urlFor = id => `file://${load('src/core/mediaLibrary/cachePath.js').buildMediaLibraryCacheFilePath('/private/media-library', id, 'mp3')}`
  for (const id of cached) {
    const localFilePath = urlFor(id).slice(7)
    caches.set(id, { cacheId: `cache__${id}`, sourceItemId: id, versionToken: 'v1', localFilePath })
    files.add(localFilePath)
  }
  globals.app_event = load('src/event/appEvent.ts').createAppEventHub()
  const Event = load('src/event/Event.ts').default
  const stateEvents = new Event()
  globals.state_event = new Proxy(stateEvents, { get: (target, key) => key in target ? target[key] : (...args) => target.emit(key, ...args) })
  const state = load('src/store/player/state.ts').default
  const playInfo = load('src/core/player/playInfo.ts')
  // 中文注释：初始 A 由真实播放信息模块写入，随后清空初始化事件，避免影响切歌断言。
  playInfo.setPlayListId('L')
  playInfo.setPlayMusicInfo('L', songs[0])
  await new Promise(resolve => setImmediate(resolve))
  state.isPlay = playing
  state.progress.nowPlayTime = 30
  state.progress.maxPlayTime = 180
  native.queue = [{ id: 'A-native', musicId: 'A', url: urlFor('A') }]
  globals.lx.playerTrackId = 'A-native'
  const core = load('src/core/player/player.ts')
  await load('src/core/init/player/player.ts').default(setting.setting)
  if (progress) load('src/core/init/player/playProgress.ts').default()
  load('src/plugins/player/service.ts').default()

  // 中文注释：等待真实事件队列与 Promise 链排空；虚拟时钟只按测试要求推进一次性定时器。
  const flush = async() => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)) }
  const advance = async(ms = 1000) => {
    const end = now + ms
    await flush()
    for (;;) {
      const next = Array.from(timers).filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      // 中文注释：测试按顺序推进时钟，异步 flush 不会并发调用 advance。
      // eslint-disable-next-line require-atomic-updates
      now = next[1].at
      timers.delete(next[0])
      next[1].fn()
      await flush()
    }
    // eslint-disable-next-line require-atomic-updates
    now = end
    await flush()
  }
  return {
    core,
    state,
    setting,
    globals,
    native,
    calls,
    songs,
    load,
    mocks,
    urlFor,
    flush,
    advance,
    select(id) { playInfo.setPlayMusicInfo('L', songs.find(song => song.id === id)) },
    holdDownload(id) { const gate = deferred(); downloads.set(id, gate); return gate },
    setNativeHook(hook) { nativeHook = hook },
    emitNative,
    async finish() {
      native.position = 180
      await setNativeState('Stopped')
      await emitNative('PlaybackQueueEnded', { track: native.index, position: 180 })
      await advance()
    },
  }
}

module.exports = { createPlaybackHarness, deferred }
