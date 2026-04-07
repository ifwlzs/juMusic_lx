const fs = require('fs')
const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const repoRoot = __dirname

function resolveWorkspaceRoot(currentRepoRoot) {
  const parentDir = path.dirname(currentRepoRoot)
  if (path.basename(parentDir) === '.worktrees') return path.dirname(parentDir)
  return currentRepoRoot
}

function resolveNodeModulesPaths(currentRepoRoot) {
  const workspaceRoot = resolveWorkspaceRoot(currentRepoRoot)
  const candidates = [path.join(currentRepoRoot, 'node_modules')]
  if (workspaceRoot !== currentRepoRoot) {
    candidates.push(path.join(workspaceRoot, 'node_modules'))
  }
  return [...new Set(candidates)]
}

const nodeModulesPaths = resolveNodeModulesPaths(repoRoot).filter(nodeModulesPath => fs.existsSync(nodeModulesPath))
const watchFolders = nodeModulesPaths.filter(nodeModulesPath => path.dirname(nodeModulesPath) !== repoRoot)

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders,
  resolver: {
    nodeModulesPaths,
    extraNodeModules: {
      // crypto: require.resolve('react-native-quick-crypto'),
      // stream: require.resolve('stream-browserify'),
    },
  },
}

const mergedConfig = mergeConfig(getDefaultConfig(__dirname), config)
Object.defineProperty(mergedConfig, '__internal', {
  value: {
    resolveWorkspaceRoot,
    resolveNodeModulesPaths,
  },
  enumerable: false,
})

module.exports = mergedConfig
