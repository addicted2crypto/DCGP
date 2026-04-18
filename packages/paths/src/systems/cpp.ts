import { definePath } from "@dcgp/core";

export const cpp = definePath({
  id: "cpp",
  version: "1.0.0",
  name: "C++",
  description: "Modern C++ (C++20/23) with CMake.",
  tags: ["systems", "cpp", "c++"],
  signals: {
    files: ["CMakeLists.txt", "*.cpp", "*.hpp", "*.cc", "*.hh", "conanfile.txt", "vcpkg.json"],
    keywords: ["cpp", "c++", "cmake", "conan", "vcpkg"],
  },
  anchors: [
    {
      id: "stack",
      label: "C++ stack",
      priority: 100,
      content:
        "C++20 or C++23 standard. Build: CMake >= 3.20. Package mgmt: vcpkg or Conan. Test: GoogleTest or Catch2. Lint: clang-tidy. Format: clang-format.",
    },
    {
      id: "idioms",
      label: "Modern C++ idioms",
      priority: 90,
      content:
        "RAII for all resources. Use std::unique_ptr / std::shared_ptr, never raw new/delete in application code. Prefer std::span, std::string_view for parameters. constexpr where possible. No C-style casts. Rule of zero / three / five.",
    },
  ],
  gates: [
    {
      id: "raw-new-delete",
      pattern: "\\bnew\\s+\\w+|\\bdelete\\s+\\w+",
      severity: "error",
      message: "Raw new/delete in modern C++. Use smart pointers or containers.",
      context: "output",
    },
    {
      id: "c-cast",
      pattern: "\\([a-zA-Z_][a-zA-Z0-9_]*\\s*\\*\\)\\s*\\w",
      severity: "warn",
      message: "C-style cast. Use static_cast / reinterpret_cast / const_cast with intent.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "rust",
      pattern: "\\bfn\\s+\\w+\\s*\\(|\\bimpl\\s+\\w+|\\bResult<",
      severity: "error",
      correction: "This is C++, not Rust. Use std::expected or exceptions, not Result<T, E>.",
    },
  ],
  compression: {
    summarizeAs: "C++ development session",
    neverPrune: ["CMakeLists.txt", "*.hpp", "conanfile.txt", "vcpkg.json"],
  },
});
