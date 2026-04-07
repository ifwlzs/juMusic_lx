const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const readFile = filePath => fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8')

test('runtime buffer polyfill uses @craftzdog/react-native-buffer directly', () => {
  const shimFile = readFile('shim.js')
  const kgUtilFile = readFile('src/utils/musicSdk/kg/util.js')
  const metroConfig = readFile('metro.config.js')
  const config = require(path.resolve(repoRoot, 'metro.config.js'))
  const expectedNodeModulesPaths = config.__internal.resolveNodeModulesPaths(repoRoot)
  const expectedWatchFolders = expectedNodeModulesPaths.filter(nodeModulesPath => path.dirname(nodeModulesPath) !== repoRoot)

  assert.match(shimFile, /@craftzdog\/react-native-buffer/)
  assert.match(kgUtilFile, /@craftzdog\/react-native-buffer/)
  assert.doesNotMatch(shimFile, /require\('buffer'\)/)
  assert.doesNotMatch(kgUtilFile, /from 'buffer'/)
  assert.doesNotMatch(metroConfig, /buffer:\s*/)
  assert.equal(typeof config.__internal?.resolveWorkspaceRoot, 'function')
  assert.equal(typeof config.__internal?.resolveNodeModulesPaths, 'function')
  assert.deepEqual(config.resolver.nodeModulesPaths, expectedNodeModulesPaths)
  assert.deepEqual(config.watchFolders, expectedWatchFolders)

  const normalRepoRoot = path.join('D:', 'repo', 'juMusic_lx')
  const worktreeRepoRoot = path.join(normalRepoRoot, '.worktrees', 'release-notes-polish')
  const normalNodeModules = path.join(normalRepoRoot, 'node_modules')
  const workspaceNodeModules = path.join(normalRepoRoot, 'node_modules')

  assert.equal(config.__internal.resolveWorkspaceRoot(normalRepoRoot), normalRepoRoot)
  assert.equal(config.__internal.resolveWorkspaceRoot(worktreeRepoRoot), normalRepoRoot)
  assert.deepEqual(config.__internal.resolveNodeModulesPaths(normalRepoRoot), [normalNodeModules])
  assert.deepEqual(config.__internal.resolveNodeModulesPaths(worktreeRepoRoot), [
    path.join(worktreeRepoRoot, 'node_modules'),
    workspaceNodeModules,
  ])
})
