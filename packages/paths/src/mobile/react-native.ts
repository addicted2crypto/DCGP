import { definePath } from "@dcgp/core";

export const reactNative = definePath({
  id: "react-native",
  version: "1.0.0",
  name: "React Native / Expo",
  description: "Cross-platform mobile. Expo or bare RN.",
  tags: ["mobile", "react", "ios", "android"],
  signals: {
    packages: ["react-native", "expo", "@react-navigation/native", "react-native-reanimated"],
    files: ["app.json", "app.config.ts", "metro.config.js", "ios/Podfile", "android/build.gradle"],
    keywords: ["react native", "expo", "metro"],
  },
  anchors: [
    {
      id: "stack",
      label: "React Native stack",
      priority: 100,
      content:
        "React Native 0.74+ with Expo SDK 50+ (preferred) or bare RN. TypeScript strict. Navigation: @react-navigation/native. Animations: Reanimated 3. Expo Router for file-based routing.",
    },
    {
      id: "practices",
      label: "Mobile practices",
      priority: 85,
      content:
        "Use platform-specific files when APIs diverge (.ios.tsx, .android.tsx). Test on both platforms before landing. Performance: avoid inline style objects in render; use StyleSheet.create.",
    },
  ],
  gates: [
    {
      id: "no-web-apis",
      pattern: "\\bwindow\\.|\\bdocument\\.|\\blocalStorage\\b",
      severity: "error",
      message: "Web-only API in React Native. Use AsyncStorage / Platform-specific APIs.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "react",
      pattern: "<div|<span|<img\\s",
      severity: "error",
      correction: "This is React Native, not web React. Use <View>, <Text>, <Image> components.",
    },
  ],
  compression: {
    summarizeAs: "React Native mobile session",
    neverPrune: ["package.json", "app.json", "app.config.ts"],
  },
});
