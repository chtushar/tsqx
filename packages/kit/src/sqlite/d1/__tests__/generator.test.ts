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

describe("d1 generateSQL", () => {
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
            col({ name: "id", type: "INTEGER", primaryKey: true, nullable: false }),
            col({ name: "name", type: "TEXT", nullable: false }),
          ],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("CREATE TABLE users");
    expect(sql).toContain("id INTEGER PRIMARY KEY");
    expect(sql).toContain("name TEXT NOT NULL");
  });

  it("does not wrap in BEGIN/COMMIT", () => {
    const ops: Operation[] = [
      {
        type: "create_table",
        table: {
          name: "users",
          columns: [col({ name: "id", type: "INTEGER", primaryKey: true, nullable: false })],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).not.toContain("BEGIN");
    expect(sql).not.toContain("COMMIT");
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
        column: col({ name: "email", type: "TEXT", nullable: false, unique: true }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users ADD COLUMN email TEXT NOT NULL UNIQUE;");
  });

  it("generates DROP COLUMN", () => {
    const ops: Operation[] = [
      { type: "drop_column", tableName: "users", columnName: "email" },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("ALTER TABLE users DROP COLUMN email;");
  });

  it("generates comment for ALTER COLUMN (not supported in SQLite)", () => {
    const ops: Operation[] = [
      {
        type: "alter_column",
        tableName: "users",
        columnName: "name",
        from: col({ name: "name", type: "TEXT" }),
        to: col({ name: "name", type: "VARCHAR(255)" }),
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("does not support ALTER COLUMN");
    expect(sql).toContain("recreate the table");
  });

  it("generates DEFAULT in CREATE TABLE columns", () => {
    const ops: Operation[] = [
      {
        type: "create_table",
        table: {
          name: "posts",
          columns: [
            col({ name: "published", type: "INTEGER", nullable: false, default: "0" }),
          ],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain("published INTEGER NOT NULL DEFAULT 0");
  });

  it("quotes mixed-case identifiers", () => {
    const ops: Operation[] = [
      {
        type: "create_table",
        table: {
          name: "users",
          columns: [
            col({ name: "createdAt", type: "TEXT", nullable: false }),
          ],
          constraints: [],
        },
      },
    ];

    const sql = generateSQL(ops);
    expect(sql).toContain('"createdAt"');
  });
});
