import { describe, it, expect } from "vitest";
import { generateSQL } from "../generator";
import type { Operation, ColumnDef } from "@tsqx/core";

function col(overrides: Partial<ColumnDef> & { name: string; type: string }): ColumnDef {
  return {
    nullable: true,
    primaryKey: false,
    unique: false,
    ...overrides,
  };
}

describe("generateSQL", () => {
  it("returns empty string for no operations", () => {
    expect(generateSQL([])).toBe("");
  });

  it("generates CREATE TABLE", () => {
    const ops: Operation[] = [
      {
        type: "create_table",
        table: {
          name: "users",
          columns: [
            col({ name: "id", type: "SERIAL", primaryKey: true, nullable: false }),
            col({ name: "name", type: "VARCHAR(255)", nullable: false }),
          ],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("CREATE TABLE users");
    expect(sql).toContain("id SERIAL PRIMARY KEY");
    expect(sql).toContain("name VARCHAR(255) NOT NULL");
    expect(sql).toContain("COMMIT;");
  });

  it("generates DROP TABLE", () => {
    const ops: Operation[] = [{ type: "drop_table", tableName: "users" }];
    const sql = generateSQL(ops);
    expect(sql).toContain("DROP TABLE IF EXISTS users;");
  });

  it("generates ADD COLUMN", () => {
    const ops: Operation[] = [
      {
        type: "add_column",
        tableName: "users",
        column: col({ name: "email", type: "VARCHAR(255)", nullable: false, unique: true }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE;");
  });

  it("generates DROP COLUMN", () => {
    const ops: Operation[] = [
      { type: "drop_column", tableName: "users", columnName: "email" },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users DROP COLUMN email;");
  });

  it("generates ALTER COLUMN for type change", () => {
    const ops: Operation[] = [
      {
        type: "alter_column",
        tableName: "users",
        columnName: "name",
        from: col({ name: "name", type: "VARCHAR(100)" }),
        to: col({ name: "name", type: "TEXT" }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN name SET DATA TYPE TEXT;");
  });

  it("generates ALTER COLUMN for nullable change", () => {
    const ops: Operation[] = [
      {
        type: "alter_column",
        tableName: "users",
        columnName: "email",
        from: col({ name: "email", type: "VARCHAR(255)", nullable: true }),
        to: col({ name: "email", type: "VARCHAR(255)", nullable: false }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN email SET NOT NULL;");
  });

  it("generates ALTER COLUMN for default change", () => {
    const ops: Operation[] = [
      {
        type: "alter_column",
        tableName: "users",
        columnName: "active",
        from: col({ name: "active", type: "BOOLEAN" }),
        to: col({ name: "active", type: "BOOLEAN", default: "true" }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN active SET DEFAULT true;");
  });

  it("generates ALTER COLUMN for dropping default", () => {
    const ops: Operation[] = [
      {
        type: "alter_column",
        tableName: "users",
        columnName: "active",
        from: col({ name: "active", type: "BOOLEAN", default: "true" }),
        to: col({ name: "active", type: "BOOLEAN" }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ALTER COLUMN active DROP DEFAULT;");
  });

  it("generates DEFAULT in CREATE TABLE columns", () => {
    const ops: Operation[] = [
      {
        type: "create_table",
        table: {
          name: "posts",
          columns: [
            col({ name: "created_at", type: "TIMESTAMP", nullable: false, default: "NOW()" }),
          ],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  });
});
