# tsqx Architecture

> SQL-first, type-safe database toolkit. Write SQL, get types, migrations, and JSON Schema.

## Package Structure

```
packages/
  core/    @tsqx/core   — Dialect interface, differ, snapshot, config, errors, logger, codegen
  kit/     @tsqx/kit    — defineConfig(), pgDialect() via subpath exports
  cli/     @tsqx/cli    — CLI using citty, `tsqx generate` command

examples/
  postgres/pg/           — Example project using pg driver
```

## Core Concepts

### Dialect Provider Pattern

Pluggable database dialect system. Each dialect implements:

```ts
interface Dialect {
  name: string;
  parseSchema(files): Result<SchemaSnapshot, SchemaError>;   // SQL → internal representation
  generateSQL(operations): string;                            // Operations → migration SQL
  sqlTypeToJsonSchema(sqlType): JsonSchemaType;               // SQL type → JSON Schema type
  sqlTypeToTsType(sqlType): string;                           // SQL type → TypeScript type
}
```

User config:
```ts
import { defineConfig } from "@tsqx/kit";
import { pgDialect } from "@tsqx/kit/postgres/pg";

export default defineConfig({
  dialect: pgDialect(),
  // defaults: schema: "./schema", queries: "./queries", migrations: "./migrations"
});
```

### Schema Types (Internal Representation)

```ts
SchemaSnapshot = Record<string, TableDef>

TableDef { name, columns: ColumnDef[], constraints: TableConstraint[] }

ColumnDef { name, type, nullable, default?, primaryKey, unique, references? }

Operation = create_table | drop_table | add_column | drop_column | alter_column
```

### Error Handling

Uses `neverthrow` Result types throughout core. Errors: TsqxError (base), ConfigError, FileSystemError, MigrationError, QueryError, SchemaError.

## Generate Flow

When user runs `tsqx generate -c path/to/tsqx.config.ts`:

### 1. Config Loading
- Dynamically imports the config file
- Validates with Zod (dialect must implement Dialect interface, paths must be relative)
- Resolves paths relative to config file directory

### 2. Migration Generation
```
schema/*.sql → dialect.parseSchema() → SchemaSnapshot (current)
migrations/_snapshot.json → SchemaSnapshot (previous)
diffSchemas(previous, current) → Operation[]  (dialect-agnostic)
dialect.generateSQL(operations) → SQL string
Write: migrations/XXXXXX_RANDOMHEX.sql
Write: migrations/_snapshot.json (updated)
```

Migration files are wrapped in `BEGIN; ... COMMIT;` (transactional DDL).
Sequential naming: `000001_a1b2c3d4.sql`, `000002_e5f6g7h8.sql`, etc.

Supported operations:
- CREATE TABLE, DROP TABLE
- ADD COLUMN, DROP COLUMN
- ALTER COLUMN (type, nullable, default, unique constraint)

### 3. Type + JSON Schema Generation

Per table, generates a `.ts` file containing both:

```ts
// generated/users.ts
export interface Users {
  id: number;
  name: string;
  email: string;
  profile: string | null;
  created_at: string;
  updated_at: string;
}

export const UsersSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Users",
  "type": "object",
  "properties": { ... },
  "required": [...],
  "additionalProperties": false
} as const;
```

Plus a barrel `generated/index.ts` re-exporting all tables.

The JSON Schema is Standard Schema compatible — can be consumed by any validation library (Zod v4.2+, ArkType, Valibot) via their `fromJsonSchema()` methods at runtime.

### 4. Query Generation (Planned)

sqlc-style annotated SQL queries:

```sql
-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: CreateUser :one
INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *;
```

Will generate type-safe functions + JSON Schema for params.

Supported commands: `:one`, `:many`, `:exec`, `:execrows`, `:execresult`

## PostgreSQL Dialect (`@tsqx/kit/postgres/pg`)

### SQL Parser
- Regex-based, handles CREATE TABLE statements
- Supports: SERIAL, VARCHAR(n), TIMESTAMP, REFERENCES, DEFAULT, NOT NULL, UNIQUE, PRIMARY KEY
- Strips SQL comments (-- and /* */)
- Handles table-level constraints (composite PKs, foreign keys)

### Type Mappings
| SQL Type | JSON Schema | TypeScript |
|---|---|---|
| SERIAL, INTEGER, BIGINT | `{ type: "integer" }` | `number` |
| REAL, NUMERIC, DECIMAL | `{ type: "number" }` | `number` |
| BOOLEAN | `{ type: "boolean" }` | `boolean` |
| VARCHAR(n) | `{ type: "string", maxLength: n }` | `string` |
| TEXT | `{ type: "string" }` | `string` |
| UUID | `{ type: "string", format: "uuid" }` | `string` |
| TIMESTAMP | `{ type: "string", format: "date-time" }` | `string` |
| JSON/JSONB | `{ type: "object" }` | `unknown` |

### SQL Generator
- CREATE TABLE with inline + table-level constraints
- ALTER TABLE for column changes (SET DATA TYPE, SET/DROP NOT NULL, SET/DROP DEFAULT, ADD/DROP CONSTRAINT UNIQUE)
- DROP TABLE IF EXISTS
- All wrapped in BEGIN/COMMIT

## Config Validation

Zod schema with:
- `dialect`: Custom validator checking Dialect interface shape
- `queries`, `migrations`, `schema`: Relative paths (must start with `./` or `../`)
- Path security: no `<>:"|?*`, no null bytes, max 260 chars
- Defaults: `./queries`, `./migrations`, `./schema`

## Testing

61 tests across 5 test files:
- `core/__tests__/config.test.ts` — Config parsing, validation, edge cases
- `core/__tests__/differ.test.ts` — Schema diffing (add/drop/alter tables and columns)
- `kit/postgres/pg/__tests__/parser.test.ts` — SQL parsing (types, constraints, comments)
- `kit/postgres/pg/__tests__/generator.test.ts` — SQL generation (all operation types)
- `kit/postgres/pg/__tests__/mutations.test.ts` — Integration tests (full generate cycle with temp dirs)

## Tech Stack

- **Build**: tsdown (rolldown-based bundler), dual ESM + CJS output
- **Test**: vitest
- **Monorepo**: pnpm workspaces
- **Error handling**: neverthrow (Result types)
- **Config validation**: zod
- **CLI**: citty (from unjs)
- **CI**: GitHub Actions with npm provenance
