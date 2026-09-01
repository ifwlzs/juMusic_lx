package io.ifwlzs.jumusic.lx.visualizer;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

/**
 * 中文注释：只把样式参数过桥，频谱数据本身不过桥，
 * 所以这里的 prop 更新频率等于用户改设置的频率，而不是音频帧率。
 */
public class SpectrumBarsViewManager extends SimpleViewManager<SpectrumBarsView> {
  public static final String REACT_CLASS = "LxSpectrumBars";

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected SpectrumBarsView createViewInstance(ThemedReactContext context) {
    return new SpectrumBarsView(context);
  }

  @ReactProp(name = "barCount", defaultInt = 32)
  public void setBarCount(SpectrumBarsView view, int barCount) {
    view.setBarCount(barCount);
  }

  @ReactProp(name = "gapRatio", defaultFloat = 0.32f)
  public void setGapRatio(SpectrumBarsView view, float gapRatio) {
    view.setGapRatio(gapRatio);
  }

  @ReactProp(name = "minHeightRatio", defaultFloat = 0.02f)
  public void setMinHeightRatio(SpectrumBarsView view, float minHeightRatio) {
    view.setMinHeightRatio(minHeightRatio);
  }

  @ReactProp(name = "cornerRadius", defaultFloat = 2f)
  public void setCornerRadius(SpectrumBarsView view, float cornerRadius) {
    view.setCornerRadius(cornerRadius);
  }

  @ReactProp(name = "mirror", defaultBoolean = false)
  public void setMirror(SpectrumBarsView view, boolean mirror) {
    view.setMirror(mirror);
  }

  @ReactProp(name = "startColor", customType = "Color")
  public void setStartColor(SpectrumBarsView view, Integer startColor) {
    if (startColor != null) view.setColors(startColor, startColor);
  }

  @ReactProp(name = "gradientColors")
  public void setGradientColors(SpectrumBarsView view, com.facebook.react.bridge.ReadableArray colors) {
    if (colors == null || colors.size() < 2) return;
    view.setColors(colors.getInt(0), colors.getInt(1));
  }
}
