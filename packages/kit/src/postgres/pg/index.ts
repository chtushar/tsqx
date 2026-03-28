import type { Dialect } from "@tsqx/core";
import { parseSchemaFiles } from "./parser";
import { generateSQL } from "./generator";
import { sqlTypeToJsonSchema, sqlTypeToTsType } from "./types";
import { generateQueryFiles } from "./query-codegen";

export function pgDialect(): Dialect {
  return {
    name: "pg",
    parseSchema: parseSchemaFiles,
    generateSQL,
    sqlTypeToJsonSchema,
    sqlTypeToTsType,
    generateQueryCode: generateQueryFiles,
  };
}
