const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8'))
const readText = filePath => fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8')

test('Babel 导出命名空间插件使用 transform 包替代已弃用 proposal 包', () => {
  // 这里只约束本仓库直接声明和直接使用的插件，避免把 React Native 预设内部的传递依赖误判为本批技术债。
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const babelConfig = readText('babel.config.js')

  assert.equal(packageJson.devDependencies['@babel/plugin-proposal-export-namespace-from'], undefined)
  assert.match(packageJson.devDependencies['@babel/plugin-transform-export-namespace-from'], /^\^7\./)
  assert.doesNotMatch(babelConfig, /@babel\/plugin-proposal-export-namespace-from/)
  assert.match(babelConfig, /@babel\/plugin-transform-export-namespace-from/)
  assert.equal(packageLock.packages['']?.devDependencies?.['@babel/plugin-proposal-export-namespace-from'], undefined)
  assert.match(packageLock.packages['']?.devDependencies?.['@babel/plugin-transform-export-namespace-from'], /^\^7\./)
  assert.equal(packageLock.packages['node_modules/@babel/plugin-proposal-export-namespace-from'], undefined)
})

test('Babel 已标准化语法插件通过 npm alias 解析到 transform 包', () => {
  // React Native 0.73/0.74 仍声明多项已弃用 proposal 包；这里用 npm overrides 保持包名兼容，
  // 同时把实际安装内容替换成 Babel 推荐的 transform 包，避免 npm install 持续输出弃用警告。
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')

  const deprecatedProposalAliases = {
    '@babel/plugin-proposal-async-generator-functions': '@babel/plugin-transform-async-generator-functions',
    '@babel/plugin-proposal-class-properties': '@babel/plugin-transform-class-properties',
    '@babel/plugin-proposal-logical-assignment-operators': '@babel/plugin-transform-logical-assignment-operators',
    '@babel/plugin-proposal-nullish-coalescing-operator': '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-proposal-numeric-separator': '@babel/plugin-transform-numeric-separator',
    '@babel/plugin-proposal-object-rest-spread': '@babel/plugin-transform-object-rest-spread',
    '@babel/plugin-proposal-optional-catch-binding': '@babel/plugin-transform-optional-catch-binding',
    '@babel/plugin-proposal-optional-chaining': '@babel/plugin-transform-optional-chaining',
  }

  for (const [proposalPackage, transformPackage] of Object.entries(deprecatedProposalAliases)) {
    assert.match(
      packageJson.overrides?.[proposalPackage],
      new RegExp(`^npm:${transformPackage.replaceAll('/', '\\/')}@7\\.`),
      `${proposalPackage} 应通过 overrides 指向 ${transformPackage}`,
    )

    const installedProposalEntries = Object.entries(packageLock.packages).filter(([lockPath]) =>
      lockPath.endsWith(`node_modules/${proposalPackage}`))

    assert.ok(installedProposalEntries.length > 0, `${proposalPackage} 应至少存在一个被 alias 后的安装节点`)

    for (const [lockPath, lockEntry] of installedProposalEntries) {
      assert.equal(lockEntry.name, transformPackage, `${lockPath} 应安装 transform 包内容`)
      assert.equal(lockEntry.deprecated, undefined, `${lockPath} 不应再保留 npm deprecated 元数据`)
    }
  }
})
