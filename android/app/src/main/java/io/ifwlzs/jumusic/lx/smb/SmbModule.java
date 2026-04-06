package io.ifwlzs.jumusic.lx.smb;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.FileAttributes;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.EnumSet;

public class SmbModule extends ReactContextBaseJavaModule {
  private static final int DEFAULT_PORT = 445;

  public SmbModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SmbModule";
  }

  @ReactMethod
  public void listDirectory(
      String host,
      String share,
      String path,
      String username,
      String password,
      String domain,
      double port,
      Promise promise
  ) {
    SMBClient client = null;
    Connection connection = null;
    Session session = null;
    DiskShare diskShare = null;
    try {
      client = new SMBClient();
      int portNumber = port > 0 ? (int)Math.round(port) : DEFAULT_PORT;
      connection = client.connect(host, portNumber);
      session = connection.authenticate(createAuthenticationContext(username, password, domain));
      diskShare = (DiskShare)session.connectShare(share);

      WritableArray result = Arguments.createArray();
      String normalizedPath = normalizeSharePath(path);
      for (FileIdBothDirectoryInformation item : diskShare.list(normalizedPath)) {
        String name = item.getFileName();
        if (".".equals(name) || "..".equals(name)) continue;

        WritableMap map = Arguments.createMap();
        map.putString("name", name);
        map.putString("path", appendChildPath(path, name));
        map.putBoolean(
            "isDirectory",
            (item.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0
        );
        map.putDouble("size", item.getEndOfFile());
        map.putDouble("modifiedTime", item.getLastWriteTime() == null ? 0 : item.getLastWriteTime().toEpochMillis());
        result.pushMap(map);
      }
      promise.resolve(result);
    } catch (Exception error) {
      promise.reject("SMB_LIST_ERROR", error);
    } finally {
      closeQuietly(diskShare);
      closeQuietly(session);
      closeQuietly(connection);
      closeQuietly(client);
    }
  }

  @ReactMethod
  public void downloadFile(
      String host,
      String share,
      String path,
      String username,
      String password,
      String domain,
      double port,
      String localPath,
      Promise promise
  ) {
    SMBClient client = null;
    Connection connection = null;
    Session session = null;
    DiskShare diskShare = null;
    com.hierynomus.smbj.share.File remoteFile = null;
    InputStream input = null;
    FileOutputStream output = null;
    try {
      client = new SMBClient();
      int portNumber = port > 0 ? (int)Math.round(port) : DEFAULT_PORT;
      connection = client.connect(host, portNumber);
      session = connection.authenticate(createAuthenticationContext(username, password, domain));
      diskShare = (DiskShare)session.connectShare(share);

      File targetFile = new File(localPath);
      File parent = targetFile.getParentFile();
      if (parent != null && !parent.exists()) {
        parent.mkdirs();
      }

      remoteFile = diskShare.openFile(
          normalizeSharePath(path),
          EnumSet.of(AccessMask.GENERIC_READ),
          null,
          EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ, SMB2ShareAccess.FILE_SHARE_WRITE, SMB2ShareAccess.FILE_SHARE_DELETE),
          SMB2CreateDisposition.FILE_OPEN,
          null
      );
      input = remoteFile.getInputStream();
      output = new FileOutputStream(targetFile);
      copyStream(input, output);
      promise.resolve(localPath);
    } catch (Exception error) {
      promise.reject("SMB_DOWNLOAD_ERROR", error);
    } finally {
      closeQuietly(output);
      closeQuietly(input);
      closeQuietly(remoteFile);
      closeQuietly(diskShare);
      closeQuietly(session);
      closeQuietly(connection);
      closeQuietly(client);
    }
  }

  private AuthenticationContext createAuthenticationContext(String username, String password, String domain) {
    return new AuthenticationContext(
        username == null ? "" : username,
        (password == null ? "" : password).toCharArray(),
        domain == null ? "" : domain
    );
  }

  private String normalizeSharePath(String path) {
    if (path == null) return "";
    String normalized = path.replace('\\', '/').trim();
    if (normalized.isEmpty() || "/".equals(normalized)) return "";
    while (normalized.startsWith("/")) {
      normalized = normalized.substring(1);
    }
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    return normalized;
  }

  private String appendChildPath(String parentPath, String name) {
    String normalizedParent = parentPath == null ? "" : parentPath.trim();
    if (normalizedParent.isEmpty() || "/".equals(normalizedParent)) {
      return "/" + name;
    }
    if (normalizedParent.endsWith("/")) {
      return normalizedParent + name;
    }
    return normalizedParent + "/" + name;
  }

  private void copyStream(InputStream input, FileOutputStream output) throws java.io.IOException {
    byte[] buffer = new byte[8192];
    int bytesRead;
    while ((bytesRead = input.read(buffer)) != -1) {
      output.write(buffer, 0, bytesRead);
    }
    output.flush();
  }

  private void closeQuietly(SMBClient client) {
    if (client == null) return;
    try {
      client.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(Connection connection) {
    if (connection == null) return;
    try {
      connection.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(Session session) {
    if (session == null) return;
    try {
      session.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(DiskShare diskShare) {
    if (diskShare == null) return;
    try {
      diskShare.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(com.hierynomus.smbj.share.File file) {
    if (file == null) return;
    try {
      file.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(InputStream input) {
    if (input == null) return;
    try {
      input.close();
    } catch (Exception ignored) {
    }
  }

  private void closeQuietly(FileOutputStream output) {
    if (output == null) return;
    try {
      output.close();
    } catch (Exception ignored) {
    }
  }
}
