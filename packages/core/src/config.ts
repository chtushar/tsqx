import { err, ok, type Result } from "neverthrow";
import { ConfigError } from "./errors";
import type { Dialect } from "./dialect";

export interface ConfigInput {
  dialect: Dialect;
  queries?: string;
  migrations?: string;
  schema?: string;
}

export interface Config {
  dialect: Dialect;
  queries: string;
  migrations: string;
  schema: string;
}

function validateRelativePath(value: unknown, field: string): string | null {
  if (typeof value !== "string") {
    return `${field}: must be a string`;
  }
  if (!value.startsWith("./") && !value.startsWith("../")) {
    return `${field}: must be a relative path starting with './' or '../'`;
  }
  if (/[<>:"|?*]/.test(value)) {
    return `${field}: path contains invalid characters`;
  }
  if (value.includes("\0")) {
    return `${field}: path contains null bytes`;
  }
  if (value.length > 260) {
    return `${field}: path exceeds maximum length of 260 characters`;
  }
  return null;
}

function validateDialect(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    typeof (value as Dialect).name !== "string" ||
    !("parseSchema" in value) ||
    typeof (value as Dialect).parseSchema !== "function" ||
    !("generateSQL" in value) ||
    typeof (value as Dialect).generateSQL !== "function"
  ) {
    return "dialect: must be a valid Dialect instance (e.g. pgDialect())";
  }
  return null;
}

export function parseConfig(raw: unknown): Result<Config, ConfigError> {
  if (typeof raw !== "object" || raw === null) {
    return err(new ConfigError("Invalid config: expected an object"));
  }

  const input = raw as Record<string, unknown>;
  const errors: string[] = [];

  // Validate dialect
  const dialectError = validateDialect(input.dialect);
  if (dialectError) errors.push(dialectError);

  // Apply defaults and validate paths
  const queries = (input.queries as string | undefined) ?? "./queries";
  const migrations = (input.migrations as string | undefined) ?? "./migrations";
  const schema = (input.schema as string | undefined) ?? "./schema";

  if (input.queries !== undefined) {
    const e = validateRelativePath(input.queries, "queries");
    if (e) errors.push(e);
  }
  if (input.migrations !== undefined) {
    const e = validateRelativePath(input.migrations, "migrations");
    if (e) errors.push(e);
  }
  if (input.schema !== undefined) {
    const e = validateRelativePath(input.schema, "schema");
    if (e) errors.push(e);
  }

  if (errors.length > 0) {
    return err(new ConfigError(`Invalid config: ${errors.join(", ")}`));
  }

  return ok({
    dialect: input.dialect as Dialect,
    queries,
    migrations,
    schema,
  });
}
