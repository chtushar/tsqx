import { defineConfig } from "@tsqx/kit";

export default defineConfig({
  dialect: "pg",
  queries: "./queries",
  migrations: "./migrations",
  schema: "./schema",
});
