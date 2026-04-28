import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  target: "node22",
  dts: true,
  clean: true,
  sourcemap: false,
  silent: true,
});
