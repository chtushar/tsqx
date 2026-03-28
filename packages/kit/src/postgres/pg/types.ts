import type { JsonSchemaType } from "@tsqx/core";

export function sqlTypeToJsonSchema(sqlType: string): JsonSchemaType {
  const upper = sqlType.toUpperCase();
  const base = upper.replace(/\(.+\)/, "").trim();

  switch (base) {
    case "SERIAL":
    case "BIGSERIAL":
    case "INTEGER":
    case "INT":
    case "INT4":
    case "SMALLINT":
    case "INT2":
    case "BIGINT":
    case "INT8":
      return { type: "integer" };

    case "REAL":
    case "FLOAT4":
    case "DOUBLE PRECISION":
    case "FLOAT8":
    case "NUMERIC":
    case "DECIMAL":
      return { type: "number" };

    case "BOOLEAN":
    case "BOOL":
      return { type: "boolean" };

    case "TEXT":
      return { type: "string" };

    case "VARCHAR":
    case "CHARACTER VARYING": {
      const lenMatch = sqlType.match(/\((\d+)\)/);
      return lenMatch
        ? { type: "string", maxLength: parseInt(lenMatch[1], 10) }
        : { type: "string" };
    }

    case "CHAR":
    case "CHARACTER": {
      const lenMatch = sqlType.match(/\((\d+)\)/);
      return lenMatch
        ? { type: "string", maxLength: parseInt(lenMatch[1], 10) }
        : { type: "string" };
    }

    case "UUID":
      return { type: "string", format: "uuid" };

    case "DATE":
      return { type: "string", format: "date" };

    case "TIMESTAMP":
    case "TIMESTAMP WITHOUT TIME ZONE":
    case "TIMESTAMP WITH TIME ZONE":
    case "TIMESTAMPTZ":
      return { type: "string", format: "date-time" };

    case "TIME":
    case "TIME WITHOUT TIME ZONE":
    case "TIME WITH TIME ZONE":
    case "TIMETZ":
      return { type: "string", format: "time" };

    case "JSON":
    case "JSONB":
      return { type: "object" };

    case "BYTEA":
      return { type: "string", format: "byte" };

    default:
      return { type: "string" };
  }
}

export function sqlTypeToTsType(sqlType: string): string {
  const upper = sqlType.toUpperCase();
  const base = upper.replace(/\(.+\)/, "").trim();

  switch (base) {
    case "SERIAL":
    case "BIGSERIAL":
    case "INTEGER":
    case "INT":
    case "INT4":
    case "SMALLINT":
    case "INT2":
    case "BIGINT":
    case "INT8":
    case "REAL":
    case "FLOAT4":
    case "DOUBLE PRECISION":
    case "FLOAT8":
    case "NUMERIC":
    case "DECIMAL":
      return "number";

    case "BOOLEAN":
    case "BOOL":
      return "boolean";

    case "JSON":
    case "JSONB":
      return "unknown";

    case "BYTEA":
      return "Buffer";

    default:
      return "string";
  }
}
