package io.ifwlzs.jumusic.lx.visualizer;

/**
 * 定点无依赖的实数 FFT + 频段聚合。
 *
 * 中文注释：这里对应 PC 版 Web Audio 的 AnalyserNode。AnalyserNode 帮我们做了
 * 加窗、FFT、取模、转 dB、时间平滑这五步；移动端没有这个现成节点，所以逐步复刻：
 *   1. 单声道混音（PC 端是 destination 前的立体声，可视化只需要能量包络）
 *   2. Hann 窗（抑制矩形窗的频谱泄漏，否则柱子会互相串扰糊成一片）
 *   3. 迭代式 radix-2 FFT（避免递归带来的对象分配，音频线程不能有 GC 抖动）
 *   4. 幅值转 dB 并按 minDb..maxDb 归一化（和 AnalyserNode 的取值范围保持一致）
 *   5. 对数分组到 BAND_COUNT 个频段 + 时间平滑（人耳对频率是对数感知的，
 *      线性分组会让 3/4 的柱子都挤在无人关心的高频区）
 */
final class SpectrumAnalyzer {
  /**
   * 中文注释：4096 点。2048 点时低频 bin 宽度约 21.5Hz，而 40Hz~200Hz 这段要分给近 30 个
   * 对数频段，多数频段会塌缩到同一个 bin，单音就会让整排柱子一起跳、失去频谱区分度。
   * 4096 点把 bin 宽度降到约 10.8Hz，塌缩频段从 13 个减到 4 个。
   * 代价是窗口变长（约 93ms），但配合 1/3 重叠仍有约 32ms 的更新间隔，跟随感足够。
   */
  private static final int FFT_SIZE = 4096;
  private static final int SPECTRUM_SIZE = FFT_SIZE / 2;

  /** 中文注释：与 Web Audio AnalyserNode 默认值对齐，便于和 PC 版观感一致。 */
  private static final float MIN_DB = -100f;
  private static final float MAX_DB = -30f;
  private static final float SMOOTHING = 0.72f;

  /**
   * 中文注释：下限取 40Hz 而非 20Hz。20~40Hz 这一段几乎没有乐器基频，
   * 却要占掉对数刻度上约 9 个频段的宽度，把它让给真正有内容的频率区间更划算。
   * 上限 16kHz 之上基本没有可视信息。
   */
  private static final float MIN_FREQ = 40f;
  private static final float MAX_FREQ = 16000f;

  private final float[] window = new float[FFT_SIZE];
  private final float[] real = new float[FFT_SIZE];
  private final float[] imag = new float[FFT_SIZE];
  private final float[] sampleRing = new float[FFT_SIZE];
  private final float[] magnitudes = new float[SPECTRUM_SIZE];
  private final float[] bands = new float[AudioSpectrumBus.BAND_COUNT];
  private final int[] bandStart = new int[AudioSpectrumBus.BAND_COUNT];
  private final int[] bandEnd = new int[AudioSpectrumBus.BAND_COUNT];

  private int ringWritePos = 0;
  private int pendingSamples = 0;
  private int sampleRate = 44100;
  private boolean bandRangesValid = false;

  SpectrumAnalyzer() {
    for (int i = 0; i < FFT_SIZE; i++) {
      window[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
    }
  }

  /** 中文注释：采样率变化会改变频段边界，必须重算映射表。 */
  void configure(int sampleRate) {
    if (sampleRate > 0 && sampleRate != this.sampleRate) {
      this.sampleRate = sampleRate;
      bandRangesValid = false;
    }
    if (!bandRangesValid) buildBandRanges();
  }

  void reset() {
    java.util.Arrays.fill(sampleRing, 0f);
    java.util.Arrays.fill(bands, 0f);
    ringWritePos = 0;
    pendingSamples = 0;
  }

  /** 中文注释：把单声道样本喂入环形缓冲；攒够一帧才做 FFT。 */
  void pushSample(float sample) {
    sampleRing[ringWritePos] = sample;
    ringWritePos = (ringWritePos + 1) % FFT_SIZE;
    pendingSamples++;
  }

  /**
   * 中文注释：每 1/3 帧长推进一次，约等于 60fps 的更新率上限，
   * 既不会因为窗口重叠过多而浪费 CPU，也不会因为跨度太大而显得卡顿。
   */
  boolean isFrameReady() {
    return pendingSamples >= FFT_SIZE / 3;
  }

  /** @return 长度为 BAND_COUNT 的归一化频段幅值，复用内部数组。 */
  float[] analyze() {
    pendingSamples = 0;
    if (!bandRangesValid) buildBandRanges();

    for (int i = 0; i < FFT_SIZE; i++) {
      int ringIndex = (ringWritePos + i) % FFT_SIZE;
      real[i] = sampleRing[ringIndex] * window[i];
      imag[i] = 0f;
    }

    transform();

    // 中文注释：单边谱补偿 2 倍能量，并按窗口长度归一化。
    for (int i = 0; i < SPECTRUM_SIZE; i++) {
      float re = real[i];
      float im = imag[i];
      magnitudes[i] = (float) Math.sqrt(re * re + im * im) * 2f / FFT_SIZE;
    }

    for (int band = 0; band < AudioSpectrumBus.BAND_COUNT; band++) {
      int start = bandStart[band];
      int end = bandEnd[band];
      float peak = 0f;
      // 中文注释：组内取峰值而非均值，否则宽频段会被相邻的空频点稀释掉。
      for (int i = start; i <= end; i++) {
        if (magnitudes[i] > peak) peak = magnitudes[i];
      }

      float db = peak > 1e-7f ? (float) (20 * Math.log10(peak)) : MIN_DB;
      float normalized = (db - MIN_DB) / (MAX_DB - MIN_DB);
      if (normalized < 0f) normalized = 0f;
      else if (normalized > 1f) normalized = 1f;

      // 中文注释：上升快、下落慢。上升快才跟得上鼓点，下落慢才不会闪烁刺眼。
      float previous = bands[band];
      bands[band] = normalized > previous
        ? normalized
        : previous * SMOOTHING + normalized * (1f - SMOOTHING);
    }

    return bands;
  }

  /** 中文注释：对数分频，低频给足分辨率，高频合并成宽带。 */
  private void buildBandRanges() {
    float nyquist = sampleRate / 2f;
    float maxFreq = Math.min(MAX_FREQ, nyquist);
    double logMin = Math.log(MIN_FREQ);
    double logMax = Math.log(maxFreq);
    int lastIndex = SPECTRUM_SIZE - 1;
    int previousEnd = 0;

    for (int band = 0; band < AudioSpectrumBus.BAND_COUNT; band++) {
      double lowRatio = (double) band / AudioSpectrumBus.BAND_COUNT;
      double highRatio = (double) (band + 1) / AudioSpectrumBus.BAND_COUNT;
      float lowFreq = (float) Math.exp(logMin + (logMax - logMin) * lowRatio);
      float highFreq = (float) Math.exp(logMin + (logMax - logMin) * highRatio);

      int start = (int) Math.floor(lowFreq / nyquist * lastIndex);
      int end = (int) Math.ceil(highFreq / nyquist * lastIndex);

      if (start < 1) start = 1;
      if (start < previousEnd) start = previousEnd;
      if (end > lastIndex) end = lastIndex;
      if (end < start) end = start;

      bandStart[band] = start;
      bandEnd[band] = end;
      // 中文注释：必须推进到 end。若记 start，相邻频段会共享同一个起点，
      // 于是低频区所有频段都从同一个 bin 开始累积峰值，单音会让整排柱子一起跳。
      previousEnd = end;
    }
    bandRangesValid = true;
  }

  /** 中文注释：迭代 radix-2 Cooley-Tukey，位反转置换后原地蝶形运算，零分配。 */
  private void transform() {
    int n = FFT_SIZE;
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        float tmpReal = real[i];
        real[i] = real[j];
        real[j] = tmpReal;
        float tmpImag = imag[i];
        imag[i] = imag[j];
        imag[j] = tmpImag;
      }
    }

    for (int len = 2; len <= n; len <<= 1) {
      double angle = -2 * Math.PI / len;
      float wReal = (float) Math.cos(angle);
      float wImag = (float) Math.sin(angle);
      for (int i = 0; i < n; i += len) {
        float curReal = 1f;
        float curImag = 0f;
        int half = len >> 1;
        for (int k = 0; k < half; k++) {
          int even = i + k;
          int odd = even + half;
          float oddReal = real[odd] * curReal - imag[odd] * curImag;
          float oddImag = real[odd] * curImag + imag[odd] * curReal;
          real[odd] = real[even] - oddReal;
          imag[odd] = imag[even] - oddImag;
          real[even] += oddReal;
          imag[even] += oddImag;
          float nextReal = curReal * wReal - curImag * wImag;
          curImag = curReal * wImag + curImag * wReal;
          curReal = nextReal;
        }
      }
    }
  }
}
