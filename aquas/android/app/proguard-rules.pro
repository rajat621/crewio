# Flutter engine / embedding - required, the engine talks to these via JNI
# and reflection which R8 can't see statically.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }
-dontwarn io.flutter.embedding.**

# Firebase Cloud Messaging / Firebase Core
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# flutter_local_notifications (uses reflection for its scheduled-notification
# receivers)
-keep class com.dexterous.** { *; }

# Dio / OkHttp
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# geolocator plugin
-keep class com.baseflow.geolocator.** { *; }

# Keep native method names (required by several plugins that resolve
# methods by name via JNI)
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom application/activity classes
-keep class ae.crewio.app.** { *; }

# General Android component keep rules
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider

# Line numbers preserved for readable release-build crash stack traces;
# combine with `flutter build appbundle --release --obfuscate
# --split-debug-info=<dir>` to also obfuscate Dart-level code while still
# being able to symbolicate crashes from the split-debug-info output.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile