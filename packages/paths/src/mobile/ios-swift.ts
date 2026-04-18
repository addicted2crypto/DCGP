import { definePath } from "@dcgp/core";

export const iosSwift = definePath({
  id: "ios-swift",
  version: "1.0.0",
  name: "iOS / Swift",
  description: "Native iOS with Swift and SwiftUI.",
  tags: ["mobile", "ios", "swift"],
  signals: {
    files: ["Package.swift", "*.xcodeproj", "*.xcworkspace", "Info.plist", "Podfile"],
    packages: ["SwiftUI", "Combine", "SwiftData"],
    keywords: ["swift", "swiftui", "xcode", "combine"],
  },
  anchors: [
    {
      id: "stack",
      label: "iOS stack",
      priority: 100,
      content:
        "Swift 5.9+. SwiftUI for new UI (UIKit for legacy bridging only). Concurrency via async/await + actors. Persistence: SwiftData (preferred) or Core Data. Dependency management: SwiftPM.",
    },
    {
      id: "idioms",
      label: "Swift idioms",
      priority: 80,
      content:
        "Use value types (struct) by default. Classes only when reference semantics required. Strong typing; avoid Any. Force-unwrap (!) only when invariant is guaranteed. Prefer guard let over nested if let.",
    },
  ],
  gates: [
    {
      id: "force-unwrap",
      pattern: "\\!\\s*\\.[a-z]|as!\\s",
      severity: "warn",
      message: "Force-unwrap or force-cast. Use if/guard let or as? unless the invariant is proven.",
      context: "output",
    },
    {
      id: "print-debug",
      pattern: "\\bprint\\(",
      severity: "info",
      message: "Use os.Logger, not print(), in shipped code.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "android-kotlin",
      pattern: "\\bActivity\\b|\\bIntent\\b|\\bCompose\\b",
      severity: "error",
      correction: "This is iOS/Swift, not Android/Kotlin. Use SwiftUI View, not Compose / Activity.",
    },
  ],
  compression: {
    summarizeAs: "iOS Swift development session",
    neverPrune: ["Package.swift", "*.xcodeproj", "Info.plist"],
  },
});
