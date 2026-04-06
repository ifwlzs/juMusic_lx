# OneDrive 企业账号接入设计

日期：2026-04-06  
状态：已记录，待进入实现

## 目标

本设计只覆盖 `Office 365 / Microsoft 365` 的组织账号 OneDrive 登录与文件读取接入，不处理个人版 Microsoft Account，也不在本阶段实现完整上传、写回或分享能力。

目标是为后续的媒体来源扩展提供一套稳定的认证和应用注册方案，避免在 Android 包名、签名和重定向 URI 上返工。

## 范围

1. Android 客户端使用 `Microsoft Entra ID` 应用注册。
2. 移动端认证使用 `MSAL Android`。
3. 文件访问使用 `Microsoft Graph` 的委托权限。
4. 首期只支持组织账号登录与只读浏览。
5. 不要求上 Google Play。

## 认证模型

### 1. 客户端类型

移动端必须作为 `public client` 接入：

1. App 内只保存 `client id`、`tenant id`、包名和签名哈希；
2. 不在客户端放 `client secret`；
3. 登录后通过 `MSAL Android` 获取访问令牌，再调用 `Microsoft Graph`。

### 2. 账号范围

首期建议只开组织账号：

1. `Accounts in this organizational directory only`，适合先服务单租户场景；
2. 如果后续希望多个企业租户都能登录，再切到 `Accounts in any organizational directory`；
3. 先不勾个人 Microsoft Account，避免个人版 OneDrive 和企业版差异一起压进第一版。

### 3. 权限范围

首期只读导入建议：

1. `User.Read`
2. `Files.Read`
3. `offline_access`
4. `openid`
5. `profile`

如果后续要做写入、重命名或删除，再单独评估更高权限。

## Android 约束

### 0. 当前约定包名

后续 OneDrive 企业账号登录接入统一按以下目标包名配置：

`io.ifwlzs.jumusic.lx`

因此后续在 Microsoft Entra 的 Android 平台配置、MSAL Android 本地配置、以及签名哈希计算时，都以这个包名为准。

### 0.1 当前阶段签名策略

第一阶段先使用 `debug` 签名推进开发和联调。

这意味着：

1. 当前先登记 `debug keystore` 对应的 Android `Signature hash`；
2. MSAL Android 本地配置也先按 `debug` 签名生成的 redirect URI 填写；
3. 未来如果切到自定义 `release keystore`，再补一条新的 Android redirect URI，不影响当前开发验证。

### 1. 包名

Android 平台的重定向 URI 绑定包名，因此最好尽早定最终包名。

如果后续更换包名：

1. Microsoft Entra 里的 Android redirect URI 也要一起改；
2. 设备侧会把它视为另一个 App，通常不能直接覆盖安装原包。

### 2. 签名哈希

MSAL Android 的 redirect URI 同时依赖包名和签名哈希，格式为：

`msauth://<PACKAGE_NAME>/<SIGNATURE_HASH>`

因此：

1. 调试签名和正式签名通常要分别登记；
2. 只要以后更换 keystore，就要同步补新的 redirect URI。

### 3. 非 Google Play 分发

当前不打算上 Google Play，流程会更简单：

1. 直接使用当前 APK 的签名证书生成哈希；
2. 不需要额外处理 Play App Signing 带来的签名变化；
3. 如果未来再上架 Google Play，再补登记 Play 签名对应的 redirect URI。

## 应用注册清单

1. 在 Microsoft Entra 创建新的应用注册。
2. 账号类型选组织账号范围。
3. 平台添加 `Android`。
4. 填入最终包名。
5. 填入当前签名证书的 `Signature hash`。
6. 记录 `Application (client) ID`。
7. 记录 `Directory (tenant) ID`。
8. 配置上文列出的委托权限。
9. 确认不为移动端生成 `client secret`。

## 客户端接入建议

1. Android 原生层接入 `MSAL Android`，负责登录、令牌缓存和静默刷新。
2. React Native 层只拿到必要的会话信息和 Graph 调用结果，不直接持有复杂认证状态机。
3. OneDrive 作为新的媒体来源提供者接入现有“媒体来源”体系，沿用：
   1. 账号配置
   2. 目录浏览
   3. 导入规则
   4. 后台同步
4. 首期只做浏览和导入，不把上传、删除、分享塞进同一轮。

## 建议的实施顺序

1. 先定最终包名。
2. 先用当前开发签名打通企业账号登录。
3. 再补 RN 与原生桥接。
4. 最后把 OneDrive provider 接到现有媒体来源浏览/同步流程。

## 后续实现前需要补齐的输入

1. 租户范围：
   1. 单租户
   2. 多租户组织账号

## 官方依据

1. Microsoft Entra Android redirect URI / 平台配置：
   https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri
2. Public client 与移动端应用说明：
   https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications
3. Microsoft Graph 应用注册：
   https://learn.microsoft.com/en-us/graph/auth-register-app-v2
4. Graph 权限参考：
   https://learn.microsoft.com/en-us/graph/permissions-reference
5. Android 上架 Google Play 后签名变化说明：
   https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/android-app-authentication-fails-after-published-to-google-play-store
