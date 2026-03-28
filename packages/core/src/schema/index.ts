import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { ok, err, type Result } from "neverthrow";
import { MigrationError } from "../errors";
import type { Dialect } from "../dialect";
import type { GenerateResult } from "./types";
import { readSchemaFiles } from "./reader";
import { readSnapshot, writeSnapshot } from "./snapshot";
import { diffSchemas } from "./differ";

export function generateMigrations(options: {
  schemaDir: string;
  migrationsDir: string;
  dialect: Dialect;
}): Result<GenerateResult, MigrationError> {
  const { schemaDir, migrationsDir, dialect } = options;

  // 1. Read schema files
  const filesResult = readSchemaFiles(schemaDir);
  if (filesResult.isErr()) {
    return err(new MigrationError(filesResult.error.message, filesResult.error));
  }

  // 2. Parse into snapshot (dialect-specific)
  const parseResult = dialect.parseSchema(filesResult.value);
  if (parseResult.isErr()) {
    return err(new MigrationError(parseResult.error.message, parseResult.error));
  }
  const currentSnapshot = parseResult.value;

  // 3. Read previous snapshot
  const prevResult = readSnapshot(migrationsDir);
  if (prevResult.isErr()) {
    return err(new MigrationError(prevResult.error.message, prevResult.error));
  }
  const previousSnapshot = prevResult.value;

  // 4. Diff (dialect-agnostic)
  const operations = diffSchemas(previousSnapshot, currentSnapshot);

  // 5. No changes
  if (operations.length === 0) {
    return ok({
      migrationFile: null,
      operations: [],
      snapshotUpdated: false,
      snapshot: currentSnapshot,
    });
  }

  // 6. Generate SQL (dialect-specific)
  const sql = dialect.generateSQL(operations);

  // 7. Write migration file
  const existing = readdirSync(migrationsDir).filter((f) =>
    /^\d{6}_/.test(f),
  );
  const nextSeq = String(existing.length + 1).padStart(6, "0");
  const rand = randomBytes(4).toString("hex");
  const migrationFilename = `${nextSeq}_${rand}.sql`;
  const migrationPath = join(migrationsDir, migrationFilename);

  try {
    writeFileSync(migrationPath, sql, "utf-8");
  } catch (e) {
    return err(
      new MigrationError(
        `Failed to write migration file: ${e instanceof Error ? e.message : e}`,
        e,
      ),
    );
  }

  // 8. Update snapshot
  const writeResult = writeSnapshot(migrationsDir, currentSnapshot);
  if (writeResult.isErr()) {
    return err(
      new MigrationError(writeResult.error.message, writeResult.error),
    );
  }

  return ok({
    migrationFile: migrationPath,
    operations,
    snapshotUpdated: true,
    snapshot: currentSnapshot,
  });
}

export type { SchemaSnapshot, TableDef, ColumnDef, TableConstraint, Operation, GenerateResult } from "./types";
export { diffSchemas } from "./differ";
export { generateSchemaFiles } from "./codegen";
