import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateMigrations } from "@tsqx/core";
import { d1Dialect } from "../index";

const dialect = d1Dialect();

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tsqx-d1-test-"));
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

  return { writeSchema, removeSchema, generate, readMigration };
}

describe("d1 schema mutations", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("creates initial table with SQLite syntax", () => {
    ctx.writeSchema(
      "users.sql",
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE
      );`,
    );

    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { migrationFile, operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("create_table");

    const sql = ctx.readMigration(migrationFile!);
    expect(sql).toContain("CREATE TABLE users");
    expect(sql).toContain("id INTEGER PRIMARY KEY");
    expect(sql).toContain("email TEXT NOT NULL UNIQUE");
    expect(sql).not.toContain("BEGIN");
  });

  it("detects no changes on second run", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );

    ctx.generate();
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().operations).toHaveLength(0);
  });

  it("adds a column", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const { operations } = result._unsafeUnwrap();
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("add_column");

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users ADD COLUMN email TEXT NOT NULL UNIQUE");
  });

  it("drops a column", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, bio TEXT);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("ALTER TABLE users DROP COLUMN bio");
  });

  it("adds a new table", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
    );
    ctx.generate();

    ctx.writeSchema(
      "posts.sql",
      "CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES users(id));",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("CREATE TABLE posts");
    expect(sql).toContain("REFERENCES users(id)");
  });

  it("drops a table", () => {
    ctx.writeSchema("users.sql", "CREATE TABLE users (id INTEGER PRIMARY KEY);");
    ctx.writeSchema("posts.sql", "CREATE TABLE posts (id INTEGER PRIMARY KEY);");
    ctx.generate();

    ctx.removeSchema("posts.sql");
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("DROP TABLE IF EXISTS posts");
  });

  it("generates comment for column type change (ALTER COLUMN not supported)", () => {
    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
    );
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL);",
    );
    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const sql = ctx.readMigration(result._unsafeUnwrap().migrationFile!);
    expect(sql).toContain("does not support ALTER COLUMN");
  });

  it("handles multiple mutations at once", () => {
    ctx.writeSchema("users.sql", "CREATE TABLE users (id INTEGER PRIMARY KEY, bio TEXT);");
    ctx.writeSchema("old.sql", "CREATE TABLE old (id INTEGER PRIMARY KEY);");
    ctx.generate();

    ctx.writeSchema(
      "users.sql",
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
    );
    ctx.removeSchema("old.sql");
    ctx.writeSchema("posts.sql", "CREATE TABLE posts (id INTEGER PRIMARY KEY);");

    const result = ctx.generate();
    expect(result.isOk()).toBe(true);

    const types = result._unsafeUnwrap().operations.map((o) => o.type);
    expect(types).toContain("drop_table");
    expect(types).toContain("create_table");
    expect(types).toContain("drop_column");
    expect(types).toContain("add_column");
  });
});
