const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const fastScrollPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/fastScroll.ts')
const listPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/List.tsx')
const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md')

const loadFastScrollModule = () => {
  // 直接转译纯函数模块，避免 React Native 环境影响快速滚动计算测试。
  const source = fs.readFileSync(fastScrollPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fastScrollPath,
  }).outputText

  const mod = new Module(fastScrollPath, module)
  mod.filename = fastScrollPath
  mod.paths = Module._nodeModulePaths(path.dirname(fastScrollPath))
  mod.require = request => {
    throw new Error(`Unexpected dependency: ${request}`)
  }
  mod._compile(transpiled, fastScrollPath)
  return mod.exports
}

test('我的列表快速滚动会按拖动比例换算到边界内的目标行', () => {
  const { getFastScrollTarget } = loadFastScrollModule()

  assert.equal(getFastScrollTarget({ y: 240, height: 480, itemCount: 100, rowNum: 1 }), 50)
  assert.equal(getFastScrollTarget({ y: -10, height: 480, itemCount: 100, rowNum: 1 }), 0)
  assert.equal(getFastScrollTarget({ y: 999, height: 480, itemCount: 100, rowNum: 1 }), 99)
})

test('我的列表快速滚动在横屏多列时按 FlatList 行号跳转', () => {
  const { getFastScrollTarget } = loadFastScrollModule()

  assert.equal(getFastScrollTarget({ y: 240, height: 480, itemCount: 100, rowNum: 2 }), 25)
  assert.equal(getFastScrollTarget({ y: 479, height: 480, itemCount: 101, rowNum: 2 }), 50)
})

test('我的列表快速滚动只在长列表且有有效高度时显示', () => {
  const { shouldShowFastScroll } = loadFastScrollModule()

  assert.equal(shouldShowFastScroll({ itemCount: 36, height: 480, rowNum: 1 }), false)
  assert.equal(shouldShowFastScroll({ itemCount: 37, height: 480, rowNum: 1 }), true)
  assert.equal(shouldShowFastScroll({ itemCount: 80, height: 0, rowNum: 1 }), false)
  assert.equal(shouldShowFastScroll({ itemCount: 80, height: 480, rowNum: 2 }), true)
})

test('我的列表快速滚动把手位置会跟随拖动与列表滚动并保持在边界内', () => {
  const { getFastScrollHandleTop, getFastScrollHandleTopByOffset } = loadFastScrollModule()

  assert.equal(getFastScrollHandleTop({ y: 240, height: 480, handleHeight: 60 }), 210)
  assert.equal(getFastScrollHandleTop({ y: -20, height: 480, handleHeight: 60 }), 0)
  assert.equal(getFastScrollHandleTop({ y: 520, height: 480, handleHeight: 60 }), 420)
  assert.equal(getFastScrollHandleTopByOffset({ offset: 500, contentHeight: 2000, height: 500, handleHeight: 50 }), 150)
  assert.equal(getFastScrollHandleTopByOffset({ offset: 9999, contentHeight: 2000, height: 500, handleHeight: 50 }), 450)
})

test('我的列表组件接入右侧快速滚动热区并保留中文注释', () => {
  const listFile = fs.readFileSync(listPath, 'utf8')

  // 锁定 UI 层接线契约：右侧热区用 PanResponder 驱动，并复用纯函数计算目标行。
  assert.match(listFile, /PanResponder/)
  assert.match(listFile, /shouldShowFastScroll/)
  assert.match(listFile, /getFastScrollTarget/)
  assert.match(listFile, /onPanResponderGrant/)
  assert.match(listFile, /onPanResponderMove/)
  assert.match(listFile, /scrollToIndex\(\{ index, animated: false \}\)/)
  assert.match(listFile, /\/\/.*右侧热区/)
  assert.match(listFile, /\/\/.*实际滚动位置/)
})

test('我的列表快速滚动显示明确的可拖动按钮并避免深色主题隐身', () => {
  const listFile = fs.readFileSync(listPath, 'utf8')

  // 用户需要看到可拉动的按钮，而不是只有深色背景下几乎不可见的 4px 黑色细条。
  assert.match(listFile, /useTheme/)
  assert.match(listFile, /fastScrollHandle/)
  assert.match(listFile, /fastScrollHandleGrip/)
  assert.match(listFile, /c-primary/)
  assert.doesNotMatch(listFile, /backgroundColor: 'rgba\(0,0,0,0\.28\)'/)
})

test('changelog notes mylist side fast scroll', () => {
  const changelog = fs.readFileSync(changelogPath, 'utf8')

  assert.match(changelog, /我的列表/)
  assert.match(changelog, /快速滚动/)
  assert.match(changelog, /右侧/)
  assert.match(changelog, /可拖动把手/)
})
