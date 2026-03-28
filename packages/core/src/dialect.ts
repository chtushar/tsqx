import type { Result } from "neverthrow";
import type { SchemaError } from "./errors";
import type { SchemaSnapshot, Operation } from "./schema/types";
import type { QueryDef } from "./query/types";

export interface JsonSchemaType {
  type: string | string[];
  format?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface Dialect {
  name: string;
  parseSchema(
    files: Array<{ filename: string; content: string }>,
  ): Result<SchemaSnapshot, SchemaError>;
  generateSQL(operations: Operation[]): string;
  sqlTypeToJsonSchema(sqlType: string): JsonSchemaType;
  sqlTypeToTsType(sqlType: string): string;
  generateQueryCode(queries: QueryDef[], snapshot: SchemaSnapshot): Record<string, string>;
}
