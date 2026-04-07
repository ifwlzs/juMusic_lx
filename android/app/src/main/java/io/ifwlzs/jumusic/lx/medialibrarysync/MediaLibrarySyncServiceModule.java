package io.ifwlzs.jumusic.lx.medialibrarysync;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class MediaLibrarySyncServiceModule extends ReactContextBaseJavaModule {
  private static final String EXTRA_TRIGGER = "trigger";

  public MediaLibrarySyncServiceModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return "MediaLibrarySyncServiceModule";
  }

  @ReactMethod
  public void startBackgroundSync(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      if (MediaLibrarySyncTaskService.isRunning()) {
        promise.resolve(true);
        return;
      }

      Intent intent = MediaLibrarySyncTaskService.createIntent(context);
      intent.putExtra(EXTRA_TRIGGER, "js_queue");
      ContextCompat.startForegroundService(context, intent);
      promise.resolve(true);
    } catch (Exception exception) {
      promise.reject("MEDIA_LIBRARY_SYNC_START_ERROR", exception);
    }
  }

  @ReactMethod
  public void stopBackgroundSync(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      boolean stopped = context.stopService(MediaLibrarySyncTaskService.createIntent(context));
      promise.resolve(stopped);
    } catch (Exception exception) {
      promise.reject("MEDIA_LIBRARY_SYNC_STOP_ERROR", exception);
    }
  }
}
