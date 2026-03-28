import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateMigrations } from "@tsqx/core";
import { pgDialect } from "../index";

const dialect = pgDialect();

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tsqx-test-"));
  const schemaDir = join(dir, "schema");
  const migrationsDir = join(dir, "migrations");
  mkdirSync(schemaDir);
  mkdirSync(migrationsDir);

  function writeSchema(filename: string, content: string) {
    writeFileSync(join(schemaDir, filename), content, "utf-8");
  }

  function removeSchema(filename: string) {
    rmSync(join(schemaDir, filename));
  }

  function generate() {
    return generateMigrations({ schemaDir, migrationsDir, dialect });
  }

  function readMigration(path: string) {
    return readFileSync(path, "utf-8");
  }

  return { schemaDir, migrationsDir, writeSchema, removeSchema, generate, readMigration };
}

describe("schema mutations", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("creates initial table", () => {
    ctx.writeSchema(
      "users.sql",
      `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE
      );`,
    );

    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { migrationFile, operations } = result._unsafeUnwrap();
    expect(migrationFile).not.toBeNull();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("create_table");

    const sql = ctx.readMigration(migrationFile!);
    expect(sql).toContain("CREATE TABLE users");
    expect(sql).toContain("id SERIAL PRIMARY KEY");
    expect(sql).toContain("email VARCHAR(255) NOT NULL UNIQUE");
  });

  it("detects no changes on second run", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    );

    ctx.generate();
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().operations).toHaveLength(0);
    expect(result._unsafeUnwrap().migrationFile).toBeNull();
  });

  it("adds a column", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("add_column");
    if (operations[0].type === "add_column") {
      expect(operations[0].column.name).toBe("email");
    }

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE");
  });

  it("drops a column", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, bio TEXT);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("drop_column");

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users DROP COLUMN bio");
  });

  it("changes column type", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("alter_column");

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN name SET DATA TYPE TEXT");
  });

  it("changes column nullability (nullable to not null)", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, bio TEXT);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, bio TEXT NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN bio SET NOT NULL");
  });

  it("changes column nullability (not null to nullable)", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255));",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN name DROP NOT NULL");
  });

  it("adds a default value", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, active BOOLEAN NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT true);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN active SET DEFAULT true");
  });

  it("drops a default value", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT true);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, active BOOLEAN NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN active DROP DEFAULT");
  });

  it("adds a new table", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    );
    ctx.generate();

    ctx.writeSchema(
      "posts.sql",
      "CREATE TABLE posts (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, author_id INTEGER NOT NULL REFERENCES users(id));",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("create_table");
    if (operations[0].type === "create_table") {
      expect(operations[0].table.name).toBe("posts");
    }

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("CREATE TABLE posts");
    expect(sql).toContain("REFERENCES users(id)");
  });

  it("drops a table", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    );
    ctx.writeSchema(
      "posts.sql",
      "CREATE TABLE posts (id SERIAL PRIMARY KEY);",
    );
    ctx.generate();

    ctx.removeSchema("posts.sql");
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("drop_table");

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("DROP TABLE IF EXISTS posts");
  });

  it("handles multiple mutations at once", () => {
    ctx.writeSchema(
      "users.sql",
      `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        bio TEXT
      );`,
    );
    ctx.writeSchema(
      "old_table.sql",
      "CREATE TABLE old_table (id SERIAL PRIMARY KEY);",
    );
    ctx.generate();

    // Change type, drop column, add column, drop table, add table
    ctx.writeSchema(
      "users.sql",
      `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE
      );`,
    );
    ctx.removeSchema("old_table.sql");
    ctx.writeSchema(
      "posts.sql",
      "CREATE TABLE posts (id SERIAL PRIMARY KEY);",
    );

    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    const types = operations.map((o) => o.type);
    expect(types).toContain("drop_table");
    expect(types).toContain("create_table");
    expect(types).toContain("alter_column");
    expect(types).toContain("drop_column");
    expect(types).toContain("add_column");
  });

  it("adds column with DEFAULT NULL", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, profile VARCHAR(255) DEFAULT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("add_column");
    if (operations[0].type === "add_column") {
      expect(operations[0].column.name).toBe("profile");
      expect(operations[0].column.nullable).toBe(true);
      expect(operations[0].column.default).toBe("NULL");
    }
  });

  it("adds unique constraint to existing column", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations, migrationFile } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("alter_column");

    const sql = ctx.readMigration(migrationFile!);
    expect(sql).toContain("ADD CONSTRAINT users_email_unique UNIQUE (email)");
  });

  it("wraps migrations in a transaction", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    );

    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql.startsWith("BEGIN;\n")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});
