import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, err, type Result } from "neverthrow";
import { FileSystemError } from "../errors";

export function readSchemaFiles(
  schemaDir: string,
): Result<Array<{ filename: string; content: string }>, FileSystemError> {
  try {
    const files = readdirSync(schemaDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    return ok(
      files.map((filename) => ({
        filename,
        content: readFileSync(join(schemaDir, filename), "utf-8"),
      })),
    );
  } catch (e) {
    return err(
      new FileSystemError(
        `Failed to read schema files: ${e instanceof Error ? e.message : e}`,
        e,
      ),
    );
  }
}
