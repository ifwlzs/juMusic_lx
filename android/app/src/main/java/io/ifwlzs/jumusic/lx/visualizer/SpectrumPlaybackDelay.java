package io.ifwlzs.jumusic.lx.visualizer;

import java.util.ArrayDeque;

/**
 * 把抽头频谱推迟到接近喇叭出声的时刻再发布。
 *
 * 中文注释：TeeAudioProcessor 挂在 ExoPlayer 的 AudioProcessor 链上，
 * 看到的是「即将写入 AudioTrack」的 PCM，还没经过输出缓冲和硬件延迟。
 * 喇叭真正出声通常比抽头晚约 80~150ms，所以可视化会显得比歌曲快一拍。
 * 这里按固定对齐延迟排队，切歌 / flush 时丢弃未到期帧，避免旧鼓点窜到下一首。
 */
final class SpectrumPlaybackDelay {
  /**
   * 中文注释：覆盖典型扬声器 AudioTrack 缓冲。蓝牙会更长，但先对齐「快一点」的常见听感，
   * 避免把有线/外放拖到明显滞后。
   */
  static final int DEFAULT_DELAY_MS = 100;

  interface Emitter {
    void emit(float[] bands);
  }

  private static final class Frame {
    final float[] bands;
    final long playAtMs;

    Frame(float[] bands, long playAtMs) {
      this.bands = bands;
      this.playAtMs = playAtMs;
    }
  }

  private final ArrayDeque<Frame> queue = new ArrayDeque<>();
  private final int delayMs;
  private final int bandCount;

  SpectrumPlaybackDelay() {
    this(DEFAULT_DELAY_MS, AudioSpectrumBus.BAND_COUNT);
  }

  SpectrumPlaybackDelay(int delayMs, int bandCount) {
    this.delayMs = Math.max(0, delayMs);
    this.bandCount = Math.max(1, bandCount);
  }

  void submit(float[] bands, long nowMs) {
    if (bands == null || bands.length != bandCount) return;
    float[] copy = new float[bandCount];
    System.arraycopy(bands, 0, copy, 0, bandCount);
    queue.addLast(new Frame(copy, nowMs + delayMs));
  }

  void drain(long nowMs, Emitter emitter) {
    if (emitter == null) return;
    while (!queue.isEmpty() && queue.peekFirst().playAtMs <= nowMs) {
      emitter.emit(queue.removeFirst().bands);
    }
  }

  Long nextPlayAtMs() {
    Frame next = queue.peekFirst();
    return next == null ? null : next.playAtMs;
  }

  void reset() {
    queue.clear();
  }
}
