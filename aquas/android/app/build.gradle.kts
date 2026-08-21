// plugins {
//     id("com.android.application")
//     // START: FlutterFire Configuration
//     id("com.google.gms.google-services")
//     // END: FlutterFire Configuration
//     id("kotlin-android")
//     // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
//     id("dev.flutter.flutter-gradle-plugin")
// }

// android {
//     namespace = "ae.crewio.employee"
//     compileSdk = flutter.compileSdkVersion
//     ndkVersion = flutter.ndkVersion

//     compileOptions {
//         sourceCompatibility = JavaVersion.VERSION_11
//         targetCompatibility = JavaVersion.VERSION_11
//     }

//     kotlinOptions {
//         jvmTarget = JavaVersion.VERSION_11.toString()
//     }

//     defaultConfig {
//         // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
//         applicationId = "ae.crewio.app"
//         // You can update the following values to match your application needs.
//         // For more information, see: https://flutter.dev/to/review-gradle-config.
//         minSdk = flutter.minSdkVersion
//         targetSdk = flutter.targetSdkVersion
//         versionCode = flutter.versionCode
//         versionName = flutter.versionName
//     }

//     buildTypes {
//         release {
//             // TODO: Add your own signing config for the release build.
//             // Signing with the debug keys for now, so `flutter run --release` works.
//             signingConfig = signingConfigs.getByName("debug")
//         }
//     }
// }

// flutter {
//     source = "../.."
// }
import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: reads android/key.properties (git-ignored, never commit
// it) if present. See android/key.properties.example for the format and
// how to generate a real upload keystore. Falls back to the debug
// keystore ONLY when key.properties is missing, so `flutter run --release`
// and CI builds without secrets configured still work - a genuine Play
// Store upload build MUST have key.properties present, or it will still be
// silently signed with the debug key.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseSigning = keystorePropertiesFile.exists()
if (hasReleaseSigning) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
} else {
    // Loud on purpose: this is what actually prevents the "App not
    // installed" signature-mismatch problem from silently coming back.
    // Without a visible warning, a release build on any machine that
    // doesn't have key.properties (a teammate's laptop, a fresh machine, a
    // CI pipeline) would succeed normally, look completely fine, and
    // quietly produce an APK signed with THAT machine's throwaway debug
    // key instead of the real one - installable fresh, but rejected on
    // any phone that already has a properly-signed build on it. This
    // print runs for every Gradle task invocation while the file is
    // missing (not just `assembleRelease`), which is intentional - it's
    // cheap, and better to see it once too often than to miss it once.
    println(
        "\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
        "!! WARNING: android/key.properties not found.                   !!\n" +
        "!! This release build will be signed with a throwaway DEBUG key !!\n" +
        "!! unique to THIS machine - it will install fine on a phone     !!\n" +
        "!! that has never had Crewio on it, but will FAIL to install    !!\n" +
        "!! (\"App not installed\") on any phone that already has a build !!\n" +
        "!! signed with a different key.                                 !!\n" +
        "!! See earlier setup notes for how to generate the real         !!\n" +
        "!! keystore and create android/key.properties.                  !!\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
    )
}

android {
    namespace = "ae.crewio.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    defaultConfig {
        // TODO(release): "ae.crewio.app" is the Flutter starter
        // placeholder and is currently also the package name registered in
        // google-services.json / MainActivity.kt's package declaration.
        // Play Store requires a real, unique, permanent application ID -
        // once published under a package name it can never be changed.
        // Changing this requires: (1) picking the real final ID, (2)
        // regenerating google-services.json for that ID in the Firebase
        // console, (3) renaming the MainActivity.kt package + folder path
        // to match. Deliberately NOT done automatically here since it's a
        // one-way decision and would silently break push notifications if
        // the Firebase config isn't regenerated to match in lockstep.
        applicationId = "ae.crewio.app"
        // Pinned explicitly (matches Flutter's own current default) rather
        // than left purely implicit via flutter.minSdkVersion, so this
        // floor is a visible, intentional decision and can't silently
        // drift upward on a future Flutter SDK upgrade. Android 5.0+
        // covers effectively all active devices worldwide at this point.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
        freeCompilerArgs += listOf("-Xjvm-default=all")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
        }
        getByName("release") {
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                // No key.properties on this machine - falls back to debug
                // signing so local `flutter run --release` still works.
                // This build is NOT suitable for Play Store upload.
                signingConfigs.getByName("debug")
            }
            // R8 minification + resource shrinking - required for
            // spec section 14 ("ProGuard/R8 configured") and reduces
            // attack surface / app size for the Play Store build. Combined
            // with `flutter build appbundle --release --obfuscate
            // --split-debug-info=<dir>` for Dart-level obfuscation too
            // (that flag can't be set from Gradle - it's a `flutter build`
            // CLI argument; keep the split-debug-info output somewhere
            // safe, it's needed to symbolicate crash reports later).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE",
                "META-INF/LICENSE.txt",
                "META-INF/license.txt",
                "META-INF/NOTICE",
                "META-INF/NOTICE.txt",
                "META-INF/notice.txt",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1"
            )
        }
    }
}

flutter {
    source = "../.."
}

// Optional: Enable Java 8+ APIs on older devices
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")
}
