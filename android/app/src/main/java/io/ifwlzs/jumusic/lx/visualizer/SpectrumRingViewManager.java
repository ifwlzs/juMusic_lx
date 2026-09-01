package io.ifwlzs.jumusic.lx.visualizer;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class SpectrumRingViewManager extends SimpleViewManager<SpectrumRingView> {
  public static final String REACT_CLASS = "LxSpectrumRing";

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected SpectrumRingView createViewInstance(ThemedReactContext context) {
    return new SpectrumRingView(context);
  }

  @ReactProp(name = "baseRadiusRatio", defaultFloat = 0.62f)
  public void setBaseRadiusRatio(SpectrumRingView view, float ratio) {
    view.setBaseRadiusRatio(ratio);
  }

  @ReactProp(name = "amplitudeRatio", defaultFloat = 0.16f)
  public void setAmplitudeRatio(SpectrumRingView view, float ratio) {
    view.setAmplitudeRatio(ratio);
  }

  @ReactProp(name = "ringStrokeWidth", defaultFloat = 2f)
  public void setRingStrokeWidth(SpectrumRingView view, float width) {
    view.setStrokeWidth(width);
  }

  @ReactProp(name = "rotationSpeed", defaultFloat = 6f)
  public void setRotationSpeed(SpectrumRingView view, float speed) {
    view.setRotationSpeed(speed);
  }

  @ReactProp(name = "showGlow", defaultBoolean = true)
  public void setShowGlow(SpectrumRingView view, boolean showGlow) {
    view.setShowGlow(showGlow);
  }

  @ReactProp(name = "ringColor", customType = "Color")
  public void setRingColor(SpectrumRingView view, Integer color) {
    if (color != null) view.setRingColor(color);
  }
}
