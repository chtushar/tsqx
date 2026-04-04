import type { Dialect } from "@tsqx/core";
import { parseSchemaFiles } from "./parser";
import { generateSQL } from "./generator";
import { sqlTypeToJsonSchema, sqlTypeToTsType } from "./types";
import { generateQueryFiles } from "./query-codegen";

export function d1Dialect(): Dialect {
  return {
    name: "d1",
    parseSchema: parseSchemaFiles,
    generateSQL,
    sqlTypeToJsonSchema,
    sqlTypeToTsType,
    generateQueryCode: generateQueryFiles,
  };
}
