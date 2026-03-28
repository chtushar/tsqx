import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ok, err, type Result } from "neverthrow";
import { FileSystemError } from "../errors";
import type { SchemaSnapshot } from "./types";

const SNAPSHOT_FILE = "_snapshot.json";

export function readSnapshot(
  migrationsDir: string,
): Result<SchemaSnapshot, FileSystemError> {
  const filePath = join(migrationsDir, SNAPSHOT_FILE);

  if (!existsSync(filePath)) {
    return ok({});
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return ok(JSON.parse(content) as SchemaSnapshot);
  } catch (e) {
    return err(
      new FileSystemError(
        `Failed to read snapshot: ${e instanceof Error ? e.message : e}`,
        e,
      ),
    );
  }
}

export function writeSnapshot(
  migrationsDir: string,
  snapshot: SchemaSnapshot,
): Result<void, FileSystemError> {
  const filePath = join(migrationsDir, SNAPSHOT_FILE);

  try {
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    return ok(undefined);
  } catch (e) {
    return err(
      new FileSystemError(
        `Failed to write snapshot: ${e instanceof Error ? e.message : e}`,
        e,
      ),
    );
  }
}
