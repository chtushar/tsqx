import type { Result } from "neverthrow";
import type { SchemaError } from "./errors";
import type { SchemaSnapshot, Operation } from "./schema/types";

export interface Dialect {
  name: string;
  parseSchema(
    files: Array<{ filename: string; content: string }>,
  ): Result<SchemaSnapshot, SchemaError>;
  generateSQL(operations: Operation[]): string;
}
