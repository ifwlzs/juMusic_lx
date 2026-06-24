// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

// 中文注释：集中声明依赖源码补丁，postinstall 会在 npm ci/install 完成后写入 node_modules。
// 注意补丁必须保持幂等，避免开发者重复安装依赖时向同一文件重复插入代码。
const patches = [
  {
    filePath: path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    marker: '.setIsSpeedChangeSupportRequired(true)',
    fromStr: `                .setIsGaplessSupportRequired(true)
                .build())`,
    toStr: `                .setIsGaplessSupportRequired(true)
                // 中文注释：Android 音频卸载在部分设备上不支持非 1.0 倍速；如果仍允许 offload，
                // ExoPlayer 可能只让媒体时间按倍速前进，实际音频仍按 1x 输出，最终提前结束并切歌。
                // 要求 offload 路径必须支持速度变化，不支持的设备会自动退回普通解码，确保远端缓存歌曲倍速真正作用到音频输出。
                .setIsSpeedChangeSupportRequired(true)
                .build())`,
  },
]

// 中文注释：对单个文本内容执行幂等补丁，供脚本入口和测试共同复用，确保补丁缺失时才替换。
const applyTextPatch = (fileContent, patch) => {
  if (fileContent.includes(patch.marker)) return fileContent
  if (!fileContent.includes(patch.fromStr)) {
    throw new Error(`Patch anchor not found: ${patch.filePath.replace(rootPath, '')}`)
  }
  return fileContent.replace(patch.fromStr, patch.toStr)
}

// 中文注释：补丁失败要让安装流程失败，否则 CI 可能构建出仍存在倍速/提前结束问题的包。
const applyPatch = async(patch) => {
  console.log(`Patching ${patch.filePath.replace(rootPath, '')}`)
  const file = (await fs.promises.readFile(patch.filePath)).toString()
  const patchedFile = applyTextPatch(file, patch)
  if (patchedFile == file) {
    console.log(`Skipped ${patch.filePath.replace(rootPath, '')}: already patched`)
    return
  }
  await fs.promises.writeFile(patch.filePath, patchedFile)
}

const run = async() => {
  for (const patch of patches) await applyPatch(patch)
  console.log('\nDependencies patch finished.\n')
}

if (require.main === module) {
  run().catch(err => {
    console.error(`\nDependencies patch failed: ${err.message}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  applyTextPatch,
  patches,
}
