package io.ifwlzs.jumusic.lx.medialibrarysync;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import io.ifwlzs.jumusic.lx.R;

public class MediaLibrarySyncNotificationModule extends ReactContextBaseJavaModule {
  private static final String CHANNEL_ID = "MediaLibrarySync";
  private static final int NOTIFICATION_ID = 4102;

  public MediaLibrarySyncNotificationModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return "MediaLibrarySyncNotificationModule";
  }

  @ReactMethod
  public void showSyncProgress(String title, String message, Promise promise) {
    showNotification(title, message, true);
    promise.resolve(true);
  }

  @ReactMethod
  public void showSyncFinished(String title, String message, Promise promise) {
    showNotification(title, message, false);
    promise.resolve(true);
  }

  @ReactMethod
  public void showSyncFailed(String title, String message, Promise promise) {
    showNotification(title, message, false);
    promise.resolve(true);
  }

  @ReactMethod
  public void clearSyncNotification(Promise promise) {
    NotificationManagerCompat.from(getReactApplicationContext()).cancel(NOTIFICATION_ID);
    promise.resolve(true);
  }

  private void showNotification(String title, String message, boolean ongoing) {
    ensureNotificationChannel();

    NotificationCompat.Builder builder = new NotificationCompat.Builder(getReactApplicationContext(), CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(message)
        .setOngoing(ongoing)
        .setOnlyAlertOnce(true)
        .setAutoCancel(!ongoing)
        .setPriority(NotificationCompat.PRIORITY_LOW);

    NotificationManagerCompat.from(getReactApplicationContext()).notify(NOTIFICATION_ID, builder.build());
  }

  private void ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    Context context = getReactApplicationContext();
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "Media Library Sync",
        NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription("Background status for remote media library sync");
    manager.createNotificationChannel(channel);
  }
}
