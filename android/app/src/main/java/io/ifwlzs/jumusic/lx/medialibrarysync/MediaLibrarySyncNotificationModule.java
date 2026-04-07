package io.ifwlzs.jumusic.lx.medialibrarysync;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class MediaLibrarySyncNotificationModule extends ReactContextBaseJavaModule {
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
    MediaLibrarySyncNotificationHelper.clearNotification(getReactApplicationContext());
    promise.resolve(true);
  }

  private void showNotification(String title, String message, boolean ongoing) {
    MediaLibrarySyncNotificationHelper.showNotification(
        getReactApplicationContext(),
        title,
        message,
        ongoing
    );
  }
}
