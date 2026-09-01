package io.ifwlzs.jumusic.lx.visualizer;

import java.util.concurrent.CopyOnWriteArraySet;

/**
 * 频谱数据总线。
 *
 * 中文注释：PCM 采样发生在 ExoPlayer 的音频处理线程，绘制发生在 UI 线程，
 * 两者没有直接引用关系，所以用一个进程内单例总线做解耦：
 * 采样侧只管 push，视图侧只管订阅，播放器重建 / 视图销毁都不会互相影响。
 *
 * 频段幅值统一为 0..1 的归一化值，视图层不需要再关心采样率与量化位深。
 */
public final class AudioSpectrumBus {
  /** 中文注释：频段数量固定，JS 与原生共享同一约定，避免两侧数组长度不一致。 */
  public static final int BAND_COUNT = 64;

  private static final AudioSpectrumBus INSTANCE = new AudioSpectrumBus();

  public interface Listener {
    /**
     * @param bands 长度为 {@link #BAND_COUNT} 的归一化幅值，回调期间有效，
     *              需要长期持有的实现必须自行拷贝。
     */
    void onSpectrum(float[] bands);
  }

  private final CopyOnWriteArraySet<Listener> listeners = new CopyOnWriteArraySet<>();
  private final float[] latest = new float[BAND_COUNT];

  private AudioSpectrumBus() {}

  public static AudioSpectrumBus getInstance() {
    return INSTANCE;
  }

  public void addListener(Listener listener) {
    if (listener != null) listeners.add(listener);
  }

  public void removeListener(Listener listener) {
    if (listener != null) listeners.remove(listener);
  }

  /** 中文注释：没有任何订阅者时采样侧可以直接跳过 FFT，避免后台播放时白烧 CPU。 */
  public boolean hasListeners() {
    return !listeners.isEmpty();
  }

  public void publish(float[] bands) {
    if (bands == null || bands.length != BAND_COUNT) return;
    System.arraycopy(bands, 0, latest, 0, BAND_COUNT);
    for (Listener listener : listeners) {
      listener.onSpectrum(bands);
    }
  }

  /** 中文注释：视图挂载瞬间先取一份快照，避免第一帧从全零跳变。 */
  public void copyLatestInto(float[] out) {
    if (out == null || out.length != BAND_COUNT) return;
    System.arraycopy(latest, 0, out, 0, BAND_COUNT);
  }

  /** 中文注释：停止播放时清零，避免视图停在最后一帧的柱高上。 */
  public void reset() {
    java.util.Arrays.fill(latest, 0f);
    float[] zero = new float[BAND_COUNT];
    for (Listener listener : listeners) {
      listener.onSpectrum(zero);
    }
  }
}
