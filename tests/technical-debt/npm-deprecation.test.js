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
