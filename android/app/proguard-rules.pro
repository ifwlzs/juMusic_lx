# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-keep class com.reactnativenavigation.views.element.animators.** { *; }
# -keepclassmembers class com.reactnativenavigation.views.element.animators.** { *; }


-keep class org.jaudiotagger.tag.** { *; }


-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}

# MSAL and SMBJ pull in several optional JVM-only integrations that are not
# packaged on Android. Suppress warnings for those code paths so R8 can finish
# shrinking the release build.
-dontwarn com.google.auto.value.AutoValue
-dontwarn com.google.crypto.tink.subtle.Ed25519Sign$KeyPair
-dontwarn com.google.crypto.tink.subtle.Ed25519Sign
-dontwarn com.google.crypto.tink.subtle.Ed25519Verify
-dontwarn com.google.crypto.tink.subtle.X25519
-dontwarn com.google.crypto.tink.subtle.XChaCha20Poly1305
-dontwarn edu.umd.cs.findbugs.annotations.NonNull
-dontwarn edu.umd.cs.findbugs.annotations.Nullable
-dontwarn edu.umd.cs.findbugs.annotations.SuppressFBWarnings
-dontwarn javax.el.BeanELResolver
-dontwarn javax.el.ELContext
-dontwarn javax.el.ELResolver
-dontwarn javax.el.ExpressionFactory
-dontwarn javax.el.FunctionMapper
-dontwarn javax.el.ValueExpression
-dontwarn javax.el.VariableMapper
-dontwarn org.bouncycastle.cert.X509CertificateHolder
-dontwarn org.bouncycastle.cert.jcajce.JcaX509CertificateHolder
-dontwarn org.bouncycastle.jcajce.provider.BouncyCastleFipsProvider
-dontwarn org.bouncycastle.openssl.PEMKeyPair
-dontwarn org.bouncycastle.openssl.PEMParser
-dontwarn org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
-dontwarn org.ietf.jgss.GSSContext
-dontwarn org.ietf.jgss.GSSCredential
-dontwarn org.ietf.jgss.GSSException
-dontwarn org.ietf.jgss.GSSManager
-dontwarn org.ietf.jgss.GSSName
-dontwarn org.ietf.jgss.Oid

# 音频可视化：SpectrumTap 由 react-native-track-player 的补丁通过反射按类名调用
# （两者是不同的 Gradle 模块，无法在编译期互相引用）。R8 看不到这条调用链，
# 若不保留会把类名混淆或整个类剥离，导致 release 包里可视化静默失效。
# 用 `*;` 通配全部成员：createAudioProcessors 返回数组类型，`**` 通配符匹配不到数组，
# 写成具体签名会让 R8 认为该方法不可达并整个移除，反射随后抛 NoSuchMethodException。
-keep class io.ifwlzs.jumusic.lx.visualizer.SpectrumTap { *; }
