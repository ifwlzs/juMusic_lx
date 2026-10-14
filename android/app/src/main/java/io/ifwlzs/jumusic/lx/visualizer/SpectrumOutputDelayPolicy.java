package io.ifwlzs.jumusic.lx.visualizer;

/**
 * 抽头到出声的对齐延迟。蓝牙 A2DP 缓冲明显长于扬声器。
 */
final class SpectrumOutputDelayPolicy {
  static final int SPEAKER_DELAY_MS = 100;
  static final int BLUETOOTH_DELAY_MS = 240;

  private SpectrumOutputDelayPolicy() {}

  static int resolveDelayMs(boolean bluetoothOutput) {
    return bluetoothOutput ? BLUETOOTH_DELAY_MS : SPEAKER_DELAY_MS;
  }
}
