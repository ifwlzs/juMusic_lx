const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8'))

// 仅比较 npm 常规三段版本；当前测试目标都是无预发布后缀的补丁版本。
const compareVersions = (leftVersion, rightVersion) => {
  const leftParts = leftVersion.split('-')[0].split('.').map(Number)
  const rightParts = rightVersion.split('-')[0].split('.').map(Number)

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }

  return 0
}

const findLockEntriesByPackageName = (packageLock, packageName) => Object.entries(packageLock.packages)
  .filter(([lockPath]) => lockPath.endsWith(`node_modules/${packageName}`))

// 依赖声明可能带有 ^、~ 等范围前缀；这里只提取本仓库使用的普通三段版本用于技术债基线比较。
const extractDeclaredVersion = versionRange => versionRange.match(/\d+\.\d+\.\d+/)?.[0]

const assertAllLockEntriesAtLeast = (packageLock, packageName, minimumSafeVersion) => {
  const lockEntries = findLockEntriesByPackageName(packageLock, packageName)
  assert.ok(lockEntries.length > 0, `${packageName} 应存在于 lockfile 中，才能验证 audit 基线`)

  for (const [lockPath, lockEntry] of lockEntries) {
    assert.ok(
      compareVersions(lockEntry.version, minimumSafeVersion) >= 0,
      `${lockPath} 当前为 ${lockEntry.version}，应至少升级到 ${minimumSafeVersion}`,
    )
  }
}

test('npm audit 中可补丁修复的漏洞版本不应回到 lockfile', () => {
  // 这些依赖都有同主版本或补丁版本修复；不包含需要 React Native / RNN 大版本升级的 audit 项。
  const packageLock = readJson('package-lock.json')

  assertAllLockEntriesAtLeast(packageLock, '@babel/plugin-transform-modules-systemjs', '7.29.4')
  assertAllLockEntriesAtLeast(packageLock, 'shell-quote', '1.8.4')
  assertAllLockEntriesAtLeast(packageLock, 'fast-xml-parser', '5.7.0')
  assertAllLockEntriesAtLeast(packageLock, 'fast-xml-builder', '1.2.0')

  for (const [lockPath, lockEntry] of findLockEntriesByPackageName(packageLock, 'brace-expansion')) {
    if (!lockEntry.version.startsWith('5.')) continue
    assert.ok(
      compareVersions(lockEntry.version, '5.0.6') >= 0,
      `${lockPath} 当前为 ${lockEntry.version}，brace-expansion 5.x 应至少升级到 5.0.6`,
    )
  }
})

test('React Native Navigation audit 链路不应继续安装易受攻击的 lodash', () => {
  // npm audit 当前只剩 RNN 通过 lodash 触发的 high 漏洞。RNN 8.8.8 会把 Android minSdk 提到 24；
  // 在当前 App 仍支持 minSdk 21 时，优先允许用 npm overrides 对 RNN 7 的 lodash 做同大版本安全替换。
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const declaredRnnVersion = extractDeclaredVersion(packageJson.dependencies['react-native-navigation'])
  const rnnLodashOverride = packageJson.overrides?.['react-native-navigation']?.lodash

  assert.ok(declaredRnnVersion, 'react-native-navigation 应声明普通三段版本，便于锁定 audit 修复基线')
  assert.ok(
    compareVersions(declaredRnnVersion, '8.8.8') >= 0 || rnnLodashOverride === '4.18.1',
    'react-native-navigation 应升级到 8.8.8，或显式 overrides 其 lodash 到 4.18.1 以保留 minSdk 21',
  )
  assertAllLockEntriesAtLeast(packageLock, 'lodash', '4.18.1')
})
