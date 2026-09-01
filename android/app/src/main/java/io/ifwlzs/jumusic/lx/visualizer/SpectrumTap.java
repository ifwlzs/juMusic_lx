package io.ifwlzs.jumusic.lx.visualizer;

import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.audio.TeeAudioProcessor;

/**
 * PCM 抽头的安装入口。
 *
 * 中文注释：react-native-track-player 在 node_modules 里创建 ExoPlayer，
 * 由 dependencies-patch.js 注入一行调用到这里，把抽头挂进音频链路。
 * 把安装逻辑放在本仓库而不是补丁里，是为了让补丁保持只有一行、
 * 便于依赖升级时重新对齐锚点，同时真正的实现仍然可读可测。
 */
public final class SpectrumTap {

  private static volatile boolean installed = false;

  private SpectrumTap() {}

  /**
   * 中文注释：返回给 ExoPlayer 使用的音频处理器数组。
   * TeeAudioProcessor 是旁路型处理器，原样透传音频，不改变听感。
   */
  public static AudioProcessor[] createAudioProcessors() {
    installed = true;
    return new AudioProcessor[] { new TeeAudioProcessor(new SpectrumAudioBufferSink()) };
  }

  public static boolean isInstalled() {
    return installed;
  }
}
