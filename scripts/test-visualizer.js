// 中文注释：音频可视化的频谱算法跑在 Android 原生侧，但 SpectrumAnalyzer 与 AudioSpectrumBus
// 不依赖任何 Android API，所以能用纯 JDK 直接验证真实实现，而不是另写一份 JS 端口去近似。
// 频段映射错了会让界面上所有柱子一起跳，这种问题在真机上肉眼很难判定，必须靠合成信号锁定。

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const rootPath = path.join(__dirname, '..')
const nativeDir = path.join(rootPath, 'android/app/src/main/java/io/ifwlzs/jumusic/lx/visualizer')
const testFile = path.join(rootPath, 'tests/visualizer/SpectrumAnalyzerTest.java')

const sources = [
  path.join(nativeDir, 'SpectrumAnalyzer.java'),
  path.join(nativeDir, 'AudioSpectrumBus.java'),
  testFile,
]

const run = () => {
  for (const source of sources) {
    if (!fs.existsSync(source)) throw new Error(`Missing source: ${path.relative(rootPath, source)}`)
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-visualizer-'))
  try {
    execFileSync('javac', ['-d', outDir, ...sources], { stdio: 'inherit' })
    // 中文注释：-ea 必须带上，Java 断言默认关闭，否则测试会静默全过。
    execFileSync('java', ['-ea', '-cp', outDir, 'io.ifwlzs.jumusic.lx.visualizer.SpectrumAnalyzerTest'], { stdio: 'inherit' })
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

try {
  run()
} catch (err) {
  // 中文注释：没装 JDK 时不应让整体测试流程失败，但要明确说明这项验证被跳过了。
  if (err.code == 'ENOENT') {
    console.warn('\nSkipped visualizer tests: javac/java not found on PATH.\n')
    process.exitCode = 0
  } else {
    console.error(`\nVisualizer tests failed: ${err.message}\n`)
    process.exitCode = 1
  }
}
