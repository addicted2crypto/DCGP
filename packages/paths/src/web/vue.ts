import { definePath } from "@dcgp/core";

export const vue = definePath({
  id: "vue",
  version: "1.0.0",
  name: "Vue",
  description: "Vue 3 frontend. Composition API, SFC, TypeScript.",
  tags: ["frontend", "vue", "typescript"],
  signals: {
    packages: ["vue", "@vue/runtime-core", "pinia", "vue-router", "nuxt", "vite"],
    files: ["*.vue", "vite.config.ts", "nuxt.config.ts"],
    keywords: ["vue", "nuxt", "pinia"],
  },
  anchors: [
    {
      id: "stack",
      label: "Vue stack identity",
      priority: 100,
      content:
        "Vue 3 with Composition API and <script setup>. TypeScript strict. SFC (.vue) per component. State: Pinia. Routing: vue-router. Bundler: Vite. Nuxt for SSR/meta-framework.",
    },
    {
      id: "idioms",
      label: "Vue idioms",
      priority: 80,
      content:
        "Use ref/reactive for state, computed for derived values, watch/watchEffect for side effects. defineProps / defineEmits in <script setup>. Avoid Options API in new code.",
    },
  ],
  gates: [
    {
      id: "options-api",
      pattern: "export\\s+default\\s+defineComponent\\s*\\(\\{[^}]*data\\s*\\(\\)",
      severity: "warn",
      message: "Prefer <script setup> + Composition API over Options API in new code.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "react",
      pattern: "useState\\(|useEffect\\(|<React\\.Fragment",
      severity: "error",
      correction: "This is Vue. Use ref / onMounted / <template>, not React hooks.",
    },
  ],
  compression: {
    summarizeAs: "Vue development session",
    neverPrune: ["package.json", "vite.config.ts", "nuxt.config.ts"],
  },
});
