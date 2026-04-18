import { definePath } from "@dcgp/core";

export const androidKotlin = definePath({
  id: "android-kotlin",
  version: "1.0.0",
  name: "Android / Kotlin",
  description: "Native Android with Kotlin and Jetpack Compose.",
  tags: ["mobile", "android", "kotlin"],
  signals: {
    files: ["build.gradle", "build.gradle.kts", "AndroidManifest.xml", "settings.gradle"],
    packages: ["androidx.compose", "androidx.lifecycle", "kotlinx.coroutines", "com.google.dagger:hilt-android"],
    keywords: ["kotlin", "compose", "jetpack", "gradle", "android"],
  },
  anchors: [
    {
      id: "stack",
      label: "Android stack",
      priority: 100,
      content:
        "Kotlin 1.9+. Jetpack Compose for UI (View system for legacy only). Coroutines + Flow for async. Hilt for DI. Room for persistence. Gradle with Kotlin DSL (.kts).",
    },
    {
      id: "idioms",
      label: "Kotlin idioms",
      priority: 80,
      content:
        "Prefer immutable val over var. Use data classes for state. Null-safety via ?. and ?: (avoid !! unless proven). Use sealed classes for restricted hierarchies. Coroutine scope tied to lifecycle (viewModelScope / lifecycleScope).",
    },
  ],
  gates: [
    {
      id: "force-null-assert",
      pattern: "!!\\.",
      severity: "warn",
      message: "Non-null assertion (!!.) bypasses Kotlin null safety. Prefer ?: or checkNotNull with a message.",
      context: "output",
    },
    {
      id: "global-scope",
      pattern: "GlobalScope\\.launch",
      severity: "error",
      message: "GlobalScope.launch leaks; use a scope tied to a lifecycle (viewModelScope, etc).",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "ios-swift",
      pattern: "\\bSwiftUI\\b|\\bUIView\\b|\\bUIKit\\b",
      severity: "error",
      correction: "This is Android/Kotlin, not iOS/Swift. Use Jetpack Compose / View, not SwiftUI/UIKit.",
    },
  ],
  compression: {
    summarizeAs: "Android Kotlin session",
    neverPrune: ["build.gradle*", "AndroidManifest.xml", "settings.gradle*"],
  },
});
