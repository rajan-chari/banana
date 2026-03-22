# Claude-KB

Domain knowledge and lessons learned for emcom_android.

## Lessons Learned

### 2026-03-22: PullToRefreshBox must wrap content, not sit inside a loading branch
`PullToRefreshBox(isRefreshing = state.isLoading)` inside an `else` branch that only renders when `isLoading == false` means the refresh indicator never shows. Move `PullToRefreshBox` outside the when/else so it always wraps the content area. Also: empty states must be inside a `LazyColumn` item, not a standalone composable, or the pull gesture has nothing scrollable to detect.

### 2026-03-22: Icons.Default.Reply doesn't exist in material-icons-core
`Icons.Default.Reply` and `Icons.AutoMirrored.Filled.Reply` are not in `androidx.compose.material:material-icons-core`. They require the `material-icons-extended` dependency. Workaround: use `Icons.AutoMirrored.Filled.Send` or add `material-icons-extended` (adds ~2MB to APK).

### 2026-03-22: WiFi ADB pairing fails if phone is on VPN
`adb pair` gives `protocol fault (couldn't read status message)` when the phone's wireless debugging screen shows a VPN IP (e.g., `100.67.x.x` from CGNAT/Tailscale) instead of the local WiFi IP. Fix: disable VPN on phone first, then the pairing screen shows the correct `10.0.0.x` address. Always verify with `ping` before attempting `adb pair`.

### 2026-03-22: Gradle wrapper JAR from GitHub raw URL works
Downloaded `gradle-wrapper.jar` from `https://raw.githubusercontent.com/gradle/gradle/v8.9.0/gradle/wrapper/gradle-wrapper.jar` — 43KB, works fine. No need for a full Gradle install to bootstrap the wrapper.

### 2026-03-22: Android SDK setup without Android Studio
Install JDK 17 via `winget install Microsoft.OpenJDK.17`, then download cmdline-tools from `https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip`. Extract to `$ANDROID_SDK/cmdline-tools/latest/`, then `sdkmanager --sdk_root=$ANDROID_SDK "platforms;android-35" "build-tools;35.0.0" "platform-tools"`. Set `JAVA_HOME` and `ANDROID_HOME` env vars, or put `sdk.dir` in `local.properties`.
