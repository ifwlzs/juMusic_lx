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
    if (intent == null) {
      if (!MediaLibrarySyncPrefs.isActive(this)) {
        stopSelf();
        return START_NOT_STICKY;
      }
      intent = createIntent(this);
      intent.putExtra(EXTRA_TRIGGER, "sticky_restart");
    }
    super.onStartCommand(intent, flags, startId);
    return START_STICKY;
  }

  @Override
  protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    WritableMap data = Arguments.createMap();
    if (intent != null && intent.hasExtra(EXTRA_TRIGGER)) {
      data.putString(EXTRA_TRIGGER, intent.getStringExtra(EXTRA_TRIGGER));
    }
    // 中文注释：超时取 12 小时。媒体库全量同步上万首歌可能跑很久，
    // 0 在部分 RN 版本里会被当成立刻结束。allowedInForeground 让前台点更新也能挂上前台服务。
    return new HeadlessJsTaskConfig(TASK_KEY, data, 12L * 60L * 60L * 1000L, true);
  }

  @Override
  protected ReactNativeHost getReactNativeHost() {
    return ((MainApplication) getApplication()).getReactNativeHost();
  }

  @Override
  public void onDestroy() {
    RUNNING.set(false);
    // 中文注释：不要把通知一起清掉。同步完成/失败的通知需要留在栏里给用户看。
    stopForeground(false);
    super.onDestroy();
  }
}
