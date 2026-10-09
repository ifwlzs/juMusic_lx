package io.ifwlzs.jumusic.lx.visualizer;

import android.media.AudioFormat;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * 挂在 ExoPlayer 音频链路上的 PCM 抽头。
 *
 * 中文注释：这是移动端能拿到「正在播放的音频」的关键。相比 android.media.audiofx.Visualizer：
 *   - 不需要 RECORD_AUDIO 权限（Visualizer 在 Android 10+ 被当作录音行为管控）
 *   - 拿到的是本应用解码后的精确 PCM，不受系统混音与其他应用声音干扰
 *   - 不依赖 audioSessionId，播放器重建时不会失效
 *
 * 代价是走这条路必须禁用音频卸载（offload）：offload 时 PCM 直接交给硬件解码，
 * 软件链路上没有数据可抽。这个取舍在 VisualizerModule 的开关里对用户明示。
 *
 * 抽头早于 AudioTrack 出声，所以 FFT 结果会先进入 {@link SpectrumPlaybackDelay}，
 * 对齐后再交给总线，避免波纹比歌曲快一拍。
 *
 * 本类的回调运行在 ExoPlayer 音频处理线程，禁止阻塞。到期发布走主线程 Handler。
 */
public final class SpectrumAudioBufferSink
  implements androidx.media3.exoplayer.audio.TeeAudioProcessor.AudioBufferSink {

  private final SpectrumAnalyzer analyzer = new SpectrumAnalyzer();
  private final AudioSpectrumBus bus = AudioSpectrumBus.getInstance();
  private final SpectrumPlaybackDelay playbackDelay = new SpectrumPlaybackDelay();
  private final Handler publishHandler = new Handler(Looper.getMainLooper());
  private final Runnable publishDueFrames = this::publishDueFrames;

  private int channelCount = 2;
  private int encoding = AudioFormat.ENCODING_PCM_16BIT;

  @Override
  public void flush(int sampleRateHz, int channelCount, int encoding) {
    this.channelCount = Math.max(1, channelCount);
    this.encoding = encoding;
    analyzer.configure(sampleRateHz);
    analyzer.reset();
    publishHandler.removeCallbacks(publishDueFrames);
    playbackDelay.reset();
    bus.reset();
  }

  @Override
  public void handleBuffer(ByteBuffer buffer) {
    // 中文注释：没有订阅者（未进入播放详情页、或功能关闭）时直接放行，
    // 保证后台播放的 CPU 与耗电开销回到零。
    if (!bus.hasListeners()) return;

    ByteOrder originalOrder = buffer.order();
    buffer.order(ByteOrder.LITTLE_ENDIAN);

    try {
      while (hasFullFrame(buffer)) {
        float mixed = 0f;
        for (int channel = 0; channel < channelCount; channel++) {
          mixed += readSample(buffer);
        }
        analyzer.pushSample(mixed / channelCount);

        if (analyzer.isFrameReady()) {
          playbackDelay.submit(analyzer.analyze(), SystemClock.uptimeMillis());
          schedulePublish();
        }
      }
    } finally {
      buffer.order(originalOrder);
    }
  }

  private void schedulePublish() {
    Long nextPlayAtMs = playbackDelay.nextPlayAtMs();
    if (nextPlayAtMs == null) return;
    publishHandler.removeCallbacks(publishDueFrames);
    publishHandler.postAtTime(publishDueFrames, nextPlayAtMs);
  }

  private void publishDueFrames() {
    playbackDelay.drain(SystemClock.uptimeMillis(), bus::publish);
    schedulePublish();
  }

  private boolean hasFullFrame(ByteBuffer buffer) {
    return buffer.remaining() >= bytesPerSample() * channelCount;
  }

  private int bytesPerSample() {
    switch (encoding) {
      case AudioFormat.ENCODING_PCM_8BIT:
        return 1;
      case AudioFormat.ENCODING_PCM_24BIT_PACKED:
        return 3;
      case AudioFormat.ENCODING_PCM_32BIT:
      case AudioFormat.ENCODING_PCM_FLOAT:
        return 4;
      case AudioFormat.ENCODING_PCM_16BIT:
      default:
        return 2;
    }
  }

  /** 中文注释：统一归一化到 -1..1，后续 FFT 就与量化位深无关。 */
  private float readSample(ByteBuffer buffer) {
    switch (encoding) {
      case AudioFormat.ENCODING_PCM_8BIT:
        // 中文注释：8bit PCM 是无符号的，需要先偏移到有符号区间。
        return ((buffer.get() & 0xFF) - 128) / 128f;
      case AudioFormat.ENCODING_PCM_24BIT_PACKED: {
        int low = buffer.get() & 0xFF;
        int mid = buffer.get() & 0xFF;
        int high = buffer.get();
        int value = (high << 16) | (mid << 8) | low;
        return value / 8388608f;
      }
      case AudioFormat.ENCODING_PCM_32BIT:
        return buffer.getInt() / 2147483648f;
      case AudioFormat.ENCODING_PCM_FLOAT:
        return buffer.getFloat();
      case AudioFormat.ENCODING_PCM_16BIT:
      default:
        return buffer.getShort() / 32768f;
    }
  }
}
