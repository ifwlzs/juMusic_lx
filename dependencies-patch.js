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
  {
    // 中文注释：音频可视化需要在 ExoPlayer 的音频链路上挂一个旁路 PCM 抽头。
    // DefaultRenderersFactory 默认构建的 AudioSink 不带自定义处理器，
    // 这里覆写 buildAudioSink，把抽头作为 AudioProcessor 注入。
    // TeeAudioProcessor 原样透传音频，不改变听感，只复制一份数据用于 FFT。
    filePath: path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    marker: 'lxSpectrumAudioProcessors',
    fromStr: `        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);`,
    toStr: `        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service) {
            // 中文注释：抽头实现位于 app 模块（io.ifwlzs.jumusic.lx.visualizer.SpectrumTap）。
            // track-player 是独立的 Gradle 模块且先于 app 编译，无法在编译期引用 app 的类，
            // 因此这里用反射在运行时解析——两者最终打进同一个 APK，classpath 上一定存在。
            // 任何异常都退回空处理器数组，即「没有可视化但播放完全正常」。
            private androidx.media3.common.audio.AudioProcessor[] lxSpectrumAudioProcessors() {
                try {
                    Object result = Class.forName("io.ifwlzs.jumusic.lx.visualizer.SpectrumTap")
                            .getMethod("createAudioProcessors")
                            .invoke(null);
                    if (result instanceof androidx.media3.common.audio.AudioProcessor[]) {
                        return (androidx.media3.common.audio.AudioProcessor[]) result;
                    }
                } catch (Throwable ignored) {}
                return new androidx.media3.common.audio.AudioProcessor[0];
            }

            @Override
            protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(
                    android.content.Context context,
                    boolean enableFloatOutput,
                    boolean enableAudioTrackPlaybackParams) {
                return new androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .setAudioProcessors(lxSpectrumAudioProcessors())
                        .build();
            }
        };`,
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
