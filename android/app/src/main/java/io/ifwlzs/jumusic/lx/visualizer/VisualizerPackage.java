package io.ifwlzs.jumusic.lx.visualizer;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class VisualizerPackage implements ReactPackage {

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Arrays.<ViewManager>asList(
      new SpectrumBarsViewManager(),
      new SpectrumRingViewManager()
    );
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    return Collections.<NativeModule>singletonList(new VisualizerModule(reactContext));
  }
}
