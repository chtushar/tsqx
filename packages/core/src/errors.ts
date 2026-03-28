export class TsqxError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "TsqxError";
  }
}

export class ConfigError extends TsqxError {
  constructor(message: string, cause?: unknown) {
    super("CONFIG_ERROR", message, cause);
    this.name = "ConfigError";
  }
}

export class FileSystemError extends TsqxError {
  constructor(message: string, cause?: unknown) {
    super("FS_ERROR", message, cause);
    this.name = "FileSystemError";
  }
}

export class MigrationError extends TsqxError {
  constructor(message: string, cause?: unknown) {
    super("MIGRATION_ERROR", message, cause);
    this.name = "MigrationError";
  }
}

export class QueryError extends TsqxError {
  constructor(message: string, cause?: unknown) {
    super("QUERY_ERROR", message, cause);
    this.name = "QueryError";
  }
}

export class SchemaError extends TsqxError {
  constructor(message: string, cause?: unknown) {
    super("SCHEMA_ERROR", message, cause);
    this.name = "SchemaError";
  }
}
