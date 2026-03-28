import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/postgres/pg/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
});
