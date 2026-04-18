import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node22",
  dts: false,
  clean: true,
  sourcemap: false,
  silent: true,
  banner: { js: "#!/usr/bin/env node" },
});
