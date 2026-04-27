package io.ifwlzs.jumusic.lx.appicon;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

import io.ifwlzs.jumusic.lx.R;

public final class AppIconResolver {
  public static final String ICON1 = "icon1";
  public static final String ICON2 = "icon2";
  public static final String ICON3 = "icon3";

  private AppIconResolver() {
  }

  public static String getCurrentIconId(Context context) {
    try {
      PackageManager pm = context.getPackageManager();
      String packageName = context.getPackageName();
      ComponentName icon1 = new ComponentName(packageName, packageName + ".MainActivityIcon1");
      ComponentName icon2 = new ComponentName(packageName, packageName + ".MainActivityIcon2");
      ComponentName icon3 = new ComponentName(packageName, packageName + ".MainActivityIcon3");

      int icon3State = pm.getComponentEnabledSetting(icon3);
      if (icon3State == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return ICON3;

      int icon2State = pm.getComponentEnabledSetting(icon2);
      if (icon2State == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return ICON2;

      int icon1State = pm.getComponentEnabledSetting(icon1);
      if (icon1State == PackageManager.COMPONENT_ENABLED_STATE_DISABLED) return ICON2;

      return ICON1;
    } catch (Exception ignored) {
      return ICON1;
    }
  }

  public static int getNotificationSmallIconResId(Context context) {
    String iconId = getCurrentIconId(context);
    if (ICON2.equals(iconId)) return R.mipmap.ic_launcher_alt;
    if (ICON3.equals(iconId)) return R.mipmap.ic_launcher_origin;
    return R.mipmap.ic_launcher;
  }
}
