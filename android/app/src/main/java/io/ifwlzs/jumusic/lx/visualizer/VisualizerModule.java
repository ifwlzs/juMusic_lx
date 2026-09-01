package io.ifwlzs.jumusic.lx.visualizer;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * 中文注释：频谱数据不走这个 module（那样会掉帧），
 * 它只负责让 JS 侧查询原生取样链路是否真的在工作，
 * 以便设置页在音频卸载开启等采样不可用的情况下给出准确提示。
 */
public class VisualizerModule extends ReactContextBaseJavaModule {

  VisualizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "VisualizerModule";
  }

  /** 中文注释：当前构建是否包含 PCM 抽头（供 JS 做能力检测，避免展示空白可视化）。 */
  @ReactMethod
  public void isSpectrumSourceAvailable(Promise promise) {
    promise.resolve(SpectrumTap.isInstalled());
  }

  /** 中文注释：视图销毁后清零，避免下次进入播放详情页时闪现上一次的残留柱高。 */
  @ReactMethod
  public void resetSpectrum(Promise promise) {
    AudioSpectrumBus.getInstance().reset();
    promise.resolve(null);
  }
}
