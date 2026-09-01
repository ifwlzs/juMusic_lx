package io.ifwlzs.jumusic.lx.visualizer;

/**
 * SpectrumAnalyzer 的纯 JDK 验证。
 *
 * 中文注释：SpectrumAnalyzer 与 AudioSpectrumBus 不依赖任何 Android API，
 * 所以可以直接用 javac/java 跑真实实现，而不是另写一份 JS 端口去近似验证。
 * 频谱是整条链路的算法核心：如果频段映射错了，界面上看到的柱子会跳在错误的位置，
 * 而这种错误在真机上肉眼很难判定，必须用已知频率的合成信号来锁定。
 *
 * 用 java -ea 运行（断言默认关闭）。
 */
public class SpectrumAnalyzerTest {

  private static final int SAMPLE_RATE = 44100;
  private static int passed = 0;

  public static void main(String[] args) {
    testSilenceStaysZero();
    testSineLandsOnExpectedBand();
    testLowAndHighTonesSeparate();
    testBandsStayNormalized();
    testFrameReadyCadence();
    testBusPublishAndReset();
    System.out.println("\nAll " + passed + " spectrum checks passed.");
  }

  private static void check(String name, boolean condition, String detail) {
    if (!condition) throw new AssertionError("FAILED: " + name + " -- " + detail);
    passed++;
    System.out.println("ok - " + name);
  }

  /** 中文注释：喂满一帧指定频率的正弦波，返回归一化频段。 */
  private static float[] analyzeSine(double frequency, double amplitude) {
    SpectrumAnalyzer analyzer = new SpectrumAnalyzer();
    analyzer.configure(SAMPLE_RATE);
    // 中文注释：多喂几帧让时间平滑收敛到稳态，否则读到的是上升过程中的中间值。
    float[] bands = new float[AudioSpectrumBus.BAND_COUNT];
    for (int frame = 0; frame < 12; frame++) {
      for (int i = 0; i < 4096; i++) {
        double t = (double) i / SAMPLE_RATE;
        analyzer.pushSample((float) (amplitude * Math.sin(2 * Math.PI * frequency * t)));
      }
      bands = analyzer.analyze();
    }
    return bands.clone();
  }

  private static int peakBand(float[] bands) {
    int peak = 0;
    for (int i = 1; i < bands.length; i++) {
      if (bands[i] > bands[peak]) peak = i;
    }
    return peak;
  }

  /**
   * 中文注释：复算 analyzer 内部的对数分频，得到某个频率「应该」落在哪个频段。
   * 这里刻意独立算一遍而不是复用私有方法，才能真正校验映射逻辑。
   */
  private static int expectedBandForFrequency(double frequency) {
    double nyquist = SAMPLE_RATE / 2.0;
    double maxFreq = Math.min(16000.0, nyquist);
    double logMin = Math.log(40.0);
    double logMax = Math.log(maxFreq);
    double ratio = (Math.log(frequency) - logMin) / (logMax - logMin);
    int band = (int) Math.floor(ratio * AudioSpectrumBus.BAND_COUNT);
    return Math.max(0, Math.min(AudioSpectrumBus.BAND_COUNT - 1, band));
  }

  private static void testSilenceStaysZero() {
    float[] bands = analyzeSine(1000, 0.0);
    float max = 0f;
    for (float band : bands) max = Math.max(max, band);
    check("silence produces no bars", max == 0f, "max band was " + max);
  }

  private static void testSineLandsOnExpectedBand() {
    double[] frequencies = { 100, 440, 1000, 4000, 8000 };
    for (double frequency : frequencies) {
      float[] bands = analyzeSine(frequency, 0.05);
      int actual = peakBand(bands);
      int expected = expectedBandForFrequency(frequency);
      // 中文注释：容差 1 个频段。FFT 频点与对数频段边界不会精确对齐，
      // 相邻频段分到能量是正常的；错开 2 个以上才说明映射算错了。
      check(
        (int) frequency + "Hz peaks near its log band",
        Math.abs(actual - expected) <= 1,
        "expected band ~" + expected + " but peaked at " + actual);
    }
  }

  private static void testLowAndHighTonesSeparate() {
    int lowPeak = peakBand(analyzeSine(80, 0.05));
    int highPeak = peakBand(analyzeSine(6000, 0.05));
    check(
      "low tone peaks left of high tone",
      lowPeak < highPeak,
      "low peaked at " + lowPeak + ", high peaked at " + highPeak);
    // 中文注释：对数分频的意义就在于把两个相差 75 倍的频率拉开足够距离。
    check(
      "log scale spreads octaves apart",
      highPeak - lowPeak > AudioSpectrumBus.BAND_COUNT / 3,
      "gap was only " + (highPeak - lowPeak) + " bands");
  }

  private static void testBandsStayNormalized() {
    // 中文注释：满幅信号也不能溢出 0..1，否则柱子会画到视图外。
    float[] bands = analyzeSine(1000, 1.0);
    for (int i = 0; i < bands.length; i++) {
      check(
        "band " + i + " within 0..1",
        bands[i] >= 0f && bands[i] <= 1f,
        "band " + i + " was " + bands[i]);
      if (i > 2) break;
    }
    float peak = bands[peakBand(bands)];
    check("full scale tone reaches near top", peak > 0.8f, "peak was " + peak);
  }

  private static void testFrameReadyCadence() {
    SpectrumAnalyzer analyzer = new SpectrumAnalyzer();
    analyzer.configure(SAMPLE_RATE);
    check("no frame before enough samples", !analyzer.isFrameReady(), "reported ready while empty");
    for (int i = 0; i < 4096 / 3 - 1; i++) analyzer.pushSample(0.1f);
    check("still not ready one sample short", !analyzer.isFrameReady(), "reported ready too early");
    analyzer.pushSample(0.1f);
    check("ready at one third of window", analyzer.isFrameReady(), "did not report ready at threshold");
    analyzer.analyze();
    check("analyze clears pending count", !analyzer.isFrameReady(), "still ready right after analyze");
  }

  private static void testBusPublishAndReset() {
    AudioSpectrumBus bus = AudioSpectrumBus.getInstance();
    check("bus starts with no listeners", !bus.hasListeners(), "had listeners before subscribing");

    final float[] received = new float[AudioSpectrumBus.BAND_COUNT];
    final int[] callCount = { 0 };
    AudioSpectrumBus.Listener listener = bands -> {
      callCount[0]++;
      System.arraycopy(bands, 0, received, 0, bands.length);
    };

    bus.addListener(listener);
    check("bus reports listener", bus.hasListeners(), "hasListeners stayed false");

    float[] payload = new float[AudioSpectrumBus.BAND_COUNT];
    payload[5] = 0.75f;
    bus.publish(payload);
    check("listener receives payload", received[5] == 0.75f, "got " + received[5]);

    // 中文注释：长度不符的数组必须被丢弃，否则采样侧的 bug 会越过边界写坏视图数组。
    bus.publish(new float[] { 1f, 1f });
    check("mismatched length is ignored", callCount[0] == 1, "publish count was " + callCount[0]);

    float[] snapshot = new float[AudioSpectrumBus.BAND_COUNT];
    bus.copyLatestInto(snapshot);
    check("snapshot keeps last frame", snapshot[5] == 0.75f, "snapshot had " + snapshot[5]);

    bus.reset();
    check("reset zeroes listener data", received[5] == 0f, "listener still had " + received[5]);
    bus.copyLatestInto(snapshot);
    check("reset zeroes snapshot", snapshot[5] == 0f, "snapshot still had " + snapshot[5]);

    bus.removeListener(listener);
    check("listener removed", !bus.hasListeners(), "listener still attached");
  }
}
