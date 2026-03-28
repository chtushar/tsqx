import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { defineCommand } from "citty";
import { parseConfig, logger, TsqxError } from "@tsqx/core";

export const generate = defineCommand({
  meta: {
    name: "generate",
    description: "Generate type-safe SQL queries",
  },
  args: {
    config: {
      type: "string",
      alias: "c",
      description: "Path to tsqx config file",
      default: "./src/db/tsqx.config.ts",
    },
  },
  async run({ args }) {
    const configPath = resolve(process.cwd(), args.config);
    logger.debug(`Loading config from ${configPath}`);

    let config;
    try {
      const mod = await import(pathToFileURL(configPath).href);
      const raw = mod.default ?? mod;

      const result = parseConfig(raw);

      if (result.isErr()) {
        logger.error(result.error.message);
        process.exit(1);
      }

      config = result.value;
    } catch (e) {
      if (e instanceof TsqxError) {
        logger.error(e.message);
      } else {
        logger.error(
          `Failed to load config: ${e instanceof Error ? e.message : e}`,
        );
      }
      process.exit(1);
    }
    const configDir = dirname(configPath);
    logger.success("Config loaded successfully");
    logger.step(`dialect: ${config.dialect}`);
    logger.step(`queries: ${resolve(configDir, config.queries)}`);
    logger.step(`migrations: ${resolve(configDir, config.migrations)}`);
    logger.step(`schema: ${resolve(configDir, config.schema)}`);
  },
});
