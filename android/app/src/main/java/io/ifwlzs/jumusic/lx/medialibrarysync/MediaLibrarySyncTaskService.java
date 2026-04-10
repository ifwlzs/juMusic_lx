package io.ifwlzs.jumusic.lx.medialibrarysync;

import android.content.Context;
import android.content.Intent;

import androidx.annotation.Nullable;

import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;

import java.util.concurrent.atomic.AtomicBoolean;

import io.ifwlzs.jumusic.lx.MainApplication;

public class MediaLibrarySyncTaskService extends HeadlessJsTaskService {
  public static final String TASK_KEY = "MediaLibrarySyncHeadlessTask";
  private static final String EXTRA_TRIGGER = "trigger";
  private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

  public static Intent createIntent(Context context) {
    return new Intent(context, MediaLibrarySyncTaskService.class);
  }

  public static boolean isRunning() {
    return RUNNING.get();
  }

  @Override
  public void onCreate() {
    super.onCreate();
    RUNNING.set(true);
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    startForeground(
        MediaLibrarySyncNotificationHelper.NOTIFICATION_ID,
        MediaLibrarySyncNotificationHelper.buildForegroundNotification(
            this,
            "媒体库同步",
            "正在准备后台同步",
            true
        )
    );
    return super.onStartCommand(intent, flags, startId);
  }

  @Override
  protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    WritableMap data = Arguments.createMap();
    if (intent != null && intent.hasExtra(EXTRA_TRIGGER)) {
      data.putString(EXTRA_TRIGGER, intent.getStringExtra(EXTRA_TRIGGER));
    }
    return new HeadlessJsTaskConfig(TASK_KEY, data, 0, true);
  }

  @Override
  protected ReactNativeHost getReactNativeHost() {
    return ((MainApplication) getApplication()).getReactNativeHost();
  }

  @Override
  public void onDestroy() {
    RUNNING.set(false);
    stopForeground(true);
    super.onDestroy();
  }
}
