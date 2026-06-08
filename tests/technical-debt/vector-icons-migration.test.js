const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8'))
const readText = filePath => fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8')

test('自定义 IcoMoon 图标迁移到按字体族拆分的新 vector-icons 包', () => {
  // 当前项目只通过自定义 IcoMoon 字体渲染图标；迁移时应移除已弃用的总包，避免引入未使用的内置字体族。
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const iconSource = readText('src/components/common/Icon.tsx')
  const icomoonFontDir = path.resolve(repoRoot, packageJson.reactNativeVectorIcons.fontDir, 'icomoon')

  assert.equal(packageJson.dependencies['react-native-vector-icons'], undefined)
  assert.equal(packageJson.devDependencies['@types/react-native-vector-icons'], undefined)
  assert.match(packageJson.dependencies['@react-native-vector-icons/icomoon'], /^\^13\./)
  assert.deepEqual(packageJson.reactNativeVectorIcons, {
    fontDir: 'src/resources/fonts',
  })

  assert.equal(packageLock.packages['node_modules/react-native-vector-icons'], undefined)
  assert.equal(packageLock.packages['']?.dependencies?.['react-native-vector-icons'], undefined)
  assert.equal(packageLock.packages['']?.devDependencies?.['@types/react-native-vector-icons'], undefined)
  assert.match(packageLock.packages['']?.dependencies?.['@react-native-vector-icons/icomoon'], /^\^13\./)

  // @react-native-vector-icons/icomoon 的 Gradle 脚本会读取 `${fontDir}/icomoon/*.ttf`，目录结构不匹配会在 CI 配置阶段失败。
  assert.equal(fs.statSync(icomoonFontDir).isDirectory(), true)
  assert.equal(fs.statSync(path.join(icomoonFontDir, 'icomoon.ttf')).isFile(), true)
  assert.equal(fs.existsSync(path.resolve(repoRoot, packageJson.reactNativeVectorIcons.fontDir, 'icomoon.ttf')), false)
  assert.equal(fs.existsSync(path.resolve(repoRoot, 'android/app/src/main/assets/fonts/icomoon.ttf')), false)

  assert.doesNotMatch(iconSource, /from ['"]react-native-vector-icons['"]/)
  assert.match(iconSource, /from ['"]@react-native-vector-icons\/icomoon['"]/)
  assert.match(iconSource, /createIconSetFromIcoMoon\(icoMoonConfig,\s*'icomoon',\s*'icomoon\.ttf'\)/)
  assert.match(iconSource, /const displaySize = rawSize \?\? scaleSizeW\(Number\(size\)\)/)
  assert.match(iconSource, /size=\{displaySize\}/)
})

test('Node 版本基线满足新版 vector-icons 依赖要求', () => {
  // @react-native-vector-icons/common 13.x 要求 Node 20.19+ 或 22+；项目统一到 22，避免 CI 与本地安装出现 EBADENGINE。
  const packageJson = readJson('package.json')
  const nvmrc = readText('.nvmrc').trim()
  const buildWorkflow = readText('.github/workflows/build-test.yml')

  assert.equal(nvmrc, 'v22')
  assert.equal(packageJson.engines.node, '>= 22')
  assert.match(buildWorkflow, /node-version-file:\s*\.nvmrc/)
  assert.doesNotMatch(buildWorkflow, /node-version:\s*20/)
})
