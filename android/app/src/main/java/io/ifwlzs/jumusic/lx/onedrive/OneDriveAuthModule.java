package io.ifwlzs.jumusic.lx.onedrive;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.microsoft.identity.client.AuthenticationCallback;
import com.microsoft.identity.client.IAccount;
import com.microsoft.identity.client.IAuthenticationResult;
import com.microsoft.identity.client.ISingleAccountPublicClientApplication;
import com.microsoft.identity.client.PublicClientApplication;
import com.microsoft.identity.client.SignInParameters;
import com.microsoft.identity.client.SilentAuthenticationCallback;
import com.microsoft.identity.client.exception.MsalException;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

import io.ifwlzs.jumusic.lx.R;

public class OneDriveAuthModule extends ReactContextBaseJavaModule {
  private static final String[] SCOPES = new String[] {
      "User.Read",
      "Files.Read.All"
  };

  @Nullable
  private ISingleAccountPublicClientApplication singleAccountApp;

  private interface SingleAccountOperation {
    void run(ISingleAccountPublicClientApplication app);
  }

  public OneDriveAuthModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return "OneDriveAuthModule";
  }

  @ReactMethod
  public void signIn(Promise promise) {
    final Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("ONEDRIVE_NO_ACTIVITY", "Current activity unavailable");
      return;
    }

    withSingleAccountApp(new SingleAccountOperation() {
      @Override
      public void run(final ISingleAccountPublicClientApplication app) {
        activity.runOnUiThread(new Runnable() {
          @Override
          public void run() {
            SignInParameters parameters = SignInParameters.builder()
                .withActivity(activity)
                .withScopes(Arrays.asList(SCOPES))
                .withCallback(new AuthenticationCallback() {
                  @Override
                  public void onSuccess(IAuthenticationResult authenticationResult) {
                    promise.resolve(toAccountMap(authenticationResult == null ? null : authenticationResult.getAccount()));
                  }

                  @Override
                  public void onError(MsalException exception) {
                    promise.reject("ONEDRIVE_SIGNIN_ERROR", exception);
                  }

                  @Override
                  public void onCancel() {
                    promise.reject("ONEDRIVE_SIGNIN_CANCELLED", "User cancelled OneDrive sign-in");
                  }
                })
                .build();
            app.signIn(parameters);
          }
        });
      }
    }, promise);
  }

  @ReactMethod
  public void signOut(Promise promise) {
    withSingleAccountApp(new SingleAccountOperation() {
      @Override
      public void run(ISingleAccountPublicClientApplication app) {
        app.signOut(new ISingleAccountPublicClientApplication.SignOutCallback() {
          @Override
          public void onSignOut() {
            promise.resolve(true);
          }

          @Override
          public void onError(@NonNull MsalException exception) {
            promise.reject("ONEDRIVE_SIGNOUT_ERROR", exception);
          }
        });
      }
    }, promise);
  }

  @ReactMethod
  public void getCurrentAccount(Promise promise) {
    withSingleAccountApp(new SingleAccountOperation() {
      @Override
      public void run(ISingleAccountPublicClientApplication app) {
        final AtomicBoolean settled = new AtomicBoolean(false);
        app.getCurrentAccountAsync(new ISingleAccountPublicClientApplication.CurrentAccountCallback() {
          private void resolveOnce(@Nullable IAccount account) {
            if (!settled.compareAndSet(false, true)) return;
            promise.resolve(toAccountMap(account));
          }

          @Override
          public void onAccountLoaded(@Nullable IAccount activeAccount) {
            resolveOnce(activeAccount);
          }

          @Override
          public void onAccountChanged(@Nullable IAccount priorAccount, @Nullable IAccount currentAccount) {
            resolveOnce(currentAccount);
          }

          @Override
          public void onError(@NonNull MsalException exception) {
            if (!settled.compareAndSet(false, true)) return;
            promise.reject("ONEDRIVE_ACCOUNT_ERROR", exception);
          }
        });
      }
    }, promise);
  }

  @ReactMethod
  public void getAccessToken(Promise promise) {
    withSingleAccountApp(new SingleAccountOperation() {
      @Override
      public void run(ISingleAccountPublicClientApplication app) {
        final AtomicBoolean settled = new AtomicBoolean(false);
        app.getCurrentAccountAsync(new ISingleAccountPublicClientApplication.CurrentAccountCallback() {
          @Override
          public void onAccountLoaded(@Nullable IAccount activeAccount) {
            if (!settled.compareAndSet(false, true)) return;
            if (activeAccount == null) {
              promise.reject("ONEDRIVE_NO_ACCOUNT", "No signed-in OneDrive account");
              return;
            }

            app.acquireTokenSilentAsync(SCOPES, activeAccount.getAuthority(), new SilentAuthenticationCallback() {
              @Override
              public void onSuccess(IAuthenticationResult authenticationResult) {
                promise.resolve(authenticationResult == null ? null : authenticationResult.getAccessToken());
              }

              @Override
              public void onError(MsalException exception) {
                promise.reject("ONEDRIVE_TOKEN_ERROR", exception);
              }
            });
          }

          @Override
          public void onAccountChanged(@Nullable IAccount priorAccount, @Nullable IAccount currentAccount) {
            onAccountLoaded(currentAccount);
          }

          @Override
          public void onError(@NonNull MsalException exception) {
            if (!settled.compareAndSet(false, true)) return;
            promise.reject("ONEDRIVE_ACCOUNT_ERROR", exception);
          }
        });
      }
    }, promise);
  }

  private void withSingleAccountApp(final SingleAccountOperation operation, final Promise promise) {
    if (singleAccountApp != null) {
      operation.run(singleAccountApp);
      return;
    }

    PublicClientApplication.createSingleAccountPublicClientApplication(
        getReactApplicationContext(),
        R.raw.auth_config_single_account,
        new PublicClientApplication.ISingleAccountApplicationCreatedListener() {
          @Override
          public void onCreated(ISingleAccountPublicClientApplication application) {
            singleAccountApp = application;
            operation.run(application);
          }

          @Override
          public void onError(MsalException exception) {
            promise.reject("ONEDRIVE_INIT_ERROR", exception);
          }
        }
    );
  }

  @Nullable
  private WritableMap toAccountMap(@Nullable IAccount account) {
    if (account == null) return null;

    WritableMap map = Arguments.createMap();
    map.putString("homeAccountId", normalize(account.getId()));
    map.putString("username", normalize(account.getUsername()));
    map.putString("authority", normalize(account.getAuthority()));
    return map;
  }

  @Nullable
  private String normalize(@Nullable String value) {
    if (value == null || value.isEmpty()) return null;
    return value;
  }
}
