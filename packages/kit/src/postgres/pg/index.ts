import type { Dialect } from "@tsqx/core";
import { parseSchemaFiles } from "./parser";
import { generateSQL } from "./generator";
import { sqlTypeToJsonSchema, sqlTypeToTsType } from "./types";

export function pgDialect(): Dialect {
  return {
    name: "pg",
    parseSchema: parseSchemaFiles,
    generateSQL,
    sqlTypeToJsonSchema,
    sqlTypeToTsType,
  };
}
