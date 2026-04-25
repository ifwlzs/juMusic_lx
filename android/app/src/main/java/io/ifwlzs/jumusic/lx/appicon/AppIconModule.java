package io.ifwlzs.jumusic.lx.appicon;

import android.app.Activity;
import android.content.ComponentName;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AppIconModule extends ReactContextBaseJavaModule {
  private static final String ICON1 = "icon1";
  private static final String ICON2 = "icon2";
  private static final String ICON3 = "icon3";

  private final ReactApplicationContext reactContext;

  AppIconModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @NonNull
  @Override
  public String getName() {
    return "AppIconModule";
  }

  @ReactMethod
  public void setIcon(String iconId, Promise promise) {
    if (!ICON1.equals(iconId) && !ICON2.equals(iconId) && !ICON3.equals(iconId)) {
      promise.reject("INVALID_ICON", "Unsupported icon id: " + iconId);
      return;
    }

    try {
      PackageManager pm = reactContext.getPackageManager();
      String packageName = reactContext.getPackageName();
      ComponentName icon1 = new ComponentName(packageName, packageName + ".MainActivityIcon1");
      ComponentName icon2 = new ComponentName(packageName, packageName + ".MainActivityIcon2");
      ComponentName icon3 = new ComponentName(packageName, packageName + ".MainActivityIcon3");

      boolean useIcon2 = ICON2.equals(iconId);
      boolean useIcon3 = ICON3.equals(iconId);
      pm.setComponentEnabledSetting(
        icon1,
        (useIcon2 || useIcon3) ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED : PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP
      );
      pm.setComponentEnabledSetting(
        icon2,
        useIcon2 ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP
      );
      pm.setComponentEnabledSetting(
        icon3,
        useIcon3 ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP
      );

      Activity activity = getCurrentActivity();
      if (activity != null) {
        activity.moveTaskToBack(true);
      }

      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("SET_ICON_FAILED", error);
    }
  }

  @ReactMethod
  public void getCurrentIcon(Promise promise) {
    try {
      PackageManager pm = reactContext.getPackageManager();
      String packageName = reactContext.getPackageName();
      ComponentName icon1 = new ComponentName(packageName, packageName + ".MainActivityIcon1");
      ComponentName icon2 = new ComponentName(packageName, packageName + ".MainActivityIcon2");
      ComponentName icon3 = new ComponentName(packageName, packageName + ".MainActivityIcon3");

      int icon3State = pm.getComponentEnabledSetting(icon3);
      if (icon3State == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
        promise.resolve(ICON3);
        return;
      }
      int icon2State = pm.getComponentEnabledSetting(icon2);
      if (icon2State == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
        promise.resolve(ICON2);
        return;
      }

      int icon1State = pm.getComponentEnabledSetting(icon1);
      if (icon1State == PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
        promise.resolve(ICON2);
        return;
      }

      promise.resolve(ICON1);
    } catch (Exception error) {
      promise.reject("GET_ICON_FAILED", error);
    }
  }
}
