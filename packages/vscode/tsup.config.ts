import { defineConfig } from "tsup";

export default defineConfig({
  entry: { extension: "src/extension.ts" },
  format: ["cjs"],
  target: "node22",
  platform: "node",
  external: ["vscode"],
  dts: false,
  clean: true,
  sourcemap: false,
  silent: true,
});
