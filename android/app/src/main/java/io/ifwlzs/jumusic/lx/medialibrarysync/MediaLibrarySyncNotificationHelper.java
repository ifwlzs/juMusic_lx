package io.ifwlzs.jumusic.lx.medialibrarysync;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import io.ifwlzs.jumusic.lx.R;

public final class MediaLibrarySyncNotificationHelper {
  public static final String CHANNEL_ID = "MediaLibrarySync";
  public static final int NOTIFICATION_ID = 4102;
  private static volatile String latestTitle = null;
  private static volatile String latestMessage = null;
  private static volatile boolean latestOngoing = false;

  private MediaLibrarySyncNotificationHelper() {
  }

  public static Notification buildNotification(Context context, String title, String message, boolean ongoing) {
    ensureNotificationChannel(context);
    return new NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(message)
        .setOngoing(ongoing)
        .setOnlyAlertOnce(true)
        .setAutoCancel(!ongoing)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build();
  }

  public static Notification buildForegroundNotification(
      Context context,
      String fallbackTitle,
      String fallbackMessage,
      boolean fallbackOngoing
  ) {
    String title = fallbackTitle;
    String message = fallbackMessage;
    boolean ongoing = fallbackOngoing;

    if (latestOngoing) {
      title = latestTitle != null ? latestTitle : fallbackTitle;
      message = latestMessage != null ? latestMessage : fallbackMessage;
      ongoing = true;
    }

    return buildNotification(context, title, message, ongoing);
  }

  public static void showNotification(Context context, String title, String message, boolean ongoing) {
    latestTitle = title;
    latestMessage = message;
    latestOngoing = ongoing;
    NotificationManagerCompat.from(context).notify(
        NOTIFICATION_ID,
        buildNotification(context, title, message, ongoing)
    );
  }

  public static void clearNotification(Context context) {
    latestTitle = null;
    latestMessage = null;
    latestOngoing = false;
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
  }

  private static void ensureNotificationChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

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
