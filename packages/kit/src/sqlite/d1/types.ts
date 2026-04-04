import type { JsonSchemaType } from "@tsqx/core";

export function sqlTypeToJsonSchema(sqlType: string): JsonSchemaType {
  const upper = sqlType.toUpperCase();
  const base = upper.replace(/\(.+\)/, "").trim();

  switch (base) {
    case "INTEGER":
    case "INT":
    case "TINYINT":
    case "SMALLINT":
    case "MEDIUMINT":
    case "BIGINT":
      return { type: "integer" };

    case "REAL":
    case "DOUBLE":
    case "DOUBLE PRECISION":
    case "FLOAT":
    case "NUMERIC":
    case "DECIMAL":
      return { type: "number" };

    case "BOOLEAN":
      return { type: "integer" };

    case "TEXT":
    case "CLOB":
      return { type: "string" };

    case "VARCHAR":
    case "CHARACTER VARYING":
    case "NVARCHAR":
    case "CHARACTER": {
      const lenMatch = sqlType.match(/\((\d+)\)/);
      return lenMatch
        ? { type: "string", maxLength: parseInt(lenMatch[1], 10) }
        : { type: "string" };
    }

    case "BLOB":
      return { type: "string", format: "byte" };

    case "DATE":
      return { type: "string", format: "date" };

    case "DATETIME":
    case "TIMESTAMP":
      return { type: "string", format: "date-time" };

    default:
      return { type: "string" };
  }
}

export function sqlTypeToTsType(sqlType: string): string {
  const upper = sqlType.toUpperCase();
  const base = upper.replace(/\(.+\)/, "").trim();

  switch (base) {
    case "INTEGER":
    case "INT":
    case "TINYINT":
    case "SMALLINT":
    case "MEDIUMINT":
    case "BIGINT":
    case "REAL":
    case "DOUBLE":
    case "DOUBLE PRECISION":
    case "FLOAT":
    case "NUMERIC":
    case "DECIMAL":
      return "number";

    case "BOOLEAN":
      return "number"; // SQLite stores as 0/1

    case "BLOB":
      return "ArrayBuffer";

    default:
      return "string";
  }
}
