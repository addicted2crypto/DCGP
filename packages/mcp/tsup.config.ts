import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "node22",
    dts: true,
    clean: true,
    sourcemap: false,
    silent: true,
  },
  {
    entry: { bin: "src/bin.ts" },
    format: ["esm"],
    target: "node22",
    dts: false,
    clean: false,
    sourcemap: false,
    silent: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
