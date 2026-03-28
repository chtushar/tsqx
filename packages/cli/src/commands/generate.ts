import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { defineCommand } from "citty";
import {
  parseConfig,
  logger,
  TsqxError,
  generateMigrations,
  generateSchemaFiles,
} from "@tsqx/core";

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
    const schemaPath = resolve(configDir, config.schema);
    const queriesPath = resolve(configDir, config.queries);
    const migrationsPath = resolve(configDir, config.migrations);

    logger.success("Config loaded successfully");

    // Validate schema directory
    if (!existsSync(schemaPath)) {
      logger.error(`Schema directory not found: ${schemaPath}`);
      process.exit(1);
    }
    if (readdirSync(schemaPath).length === 0) {
      logger.error(`Schema directory is empty: ${schemaPath}`);
      process.exit(1);
    }
    logger.step(`schema: ${schemaPath}`);

    // Validate queries directory
    if (!existsSync(queriesPath)) {
      logger.error(`Queries directory not found: ${queriesPath}`);
      process.exit(1);
    }
    if (readdirSync(queriesPath).length === 0) {
      logger.error(`Queries directory is empty: ${queriesPath}`);
      process.exit(1);
    }
    logger.step(`queries: ${queriesPath}`);

    // Create migrations directory if needed
    if (!existsSync(migrationsPath)) {
      mkdirSync(migrationsPath, { recursive: true });
      logger.step(`migrations: ${migrationsPath} (created)`);
    } else {
      logger.step(`migrations: ${migrationsPath}`);
    }

    // Generate migrations
    const result = generateMigrations({
      schemaDir: schemaPath,
      migrationsDir: migrationsPath,
      dialect: config.dialect,
    });

    if (result.isErr()) {
      logger.error(result.error.message);
      process.exit(1);
    }

    const { migrationFile, operations, snapshot } = result.value;

    if (migrationFile) {
      logger.success(`Migration generated: ${migrationFile}`);
      for (const op of operations) {
        switch (op.type) {
          case "create_table":
            logger.step(`+ CREATE TABLE ${op.table.name}`);
            break;
          case "drop_table":
            logger.step(`- DROP TABLE ${op.tableName}`);
            break;
          case "add_column":
            logger.step(`+ ADD COLUMN ${op.tableName}.${op.column.name}`);
            break;
          case "drop_column":
            logger.step(`- DROP COLUMN ${op.tableName}.${op.columnName}`);
            break;
          case "alter_column":
            logger.step(`~ ALTER COLUMN ${op.tableName}.${op.columnName}`);
            break;
        }
      }
    } else {
      logger.info("No schema changes detected");
    }

    // Generate schema files (TypeScript types + JSON Schema per table)
    const outDir = join(configDir, "generated");
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const schemaFiles = generateSchemaFiles(snapshot, config.dialect);
    for (const [filename, content] of Object.entries(schemaFiles)) {
      writeFileSync(join(outDir, filename), content, "utf-8");
    }

    logger.success(`Schema files generated: ${outDir}`);
    for (const filename of Object.keys(schemaFiles)) {
      logger.step(filename);
    }
  },
});
