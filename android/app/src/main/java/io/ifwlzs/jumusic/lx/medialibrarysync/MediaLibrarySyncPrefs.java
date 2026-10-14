package io.ifwlzs.jumusic.lx.medialibrarysync;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 中文注释：进程被杀后，前台服务能否粘性拉起，取决于这里是否还记着「同步没跑完」。
 * JS 队列本身在 AsyncStorage 里，但原生服务重启时看不到 JS 状态。
 */
final class MediaLibrarySyncPrefs {
  private static final String PREFS = "media_library_sync";
  private static final String KEY_ACTIVE = "active";

  private MediaLibrarySyncPrefs() {}

  static void setActive(Context context, boolean active) {
    if (context == null) return;
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().putBoolean(KEY_ACTIVE, active).apply();
  }

  static boolean isActive(Context context) {
    if (context == null) return false;
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_ACTIVE, false);
  }
}
