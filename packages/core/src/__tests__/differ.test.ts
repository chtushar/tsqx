import { describe, it, expect } from "vitest";
import { diffSchemas } from "../schema/differ";
import type { SchemaSnapshot, ColumnDef } from "../schema/types";

function col(overrides: Partial<ColumnDef> & { name: string; type: string }): ColumnDef {
  return {
    nullable: true,
    primaryKey: false,
    unique: false,
    ...overrides,
  };
}

describe("diffSchemas", () => {
  it("detects new table", () => {
    const previous: SchemaSnapshot = {};
    const current: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "id", type: "SERIAL", primaryKey: true, nullable: false })],
        constraints: [],
      },
    };

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("create_table");
  });

  it("detects dropped table", () => {
    const previous: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "id", type: "SERIAL" })],
        constraints: [],
      },
    };
    const current: SchemaSnapshot = {};

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ type: "drop_table", tableName: "users" });
  });

  it("detects added column", () => {
    const idCol = col({ name: "id", type: "SERIAL" });
    const emailCol = col({ name: "email", type: "VARCHAR(255)" });

    const previous: SchemaSnapshot = {
      users: { name: "users", columns: [idCol], constraints: [] },
    };
    const current: SchemaSnapshot = {
      users: { name: "users", columns: [idCol, emailCol], constraints: [] },
    };

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("add_column");
    if (ops[0].type === "add_column") {
      expect(ops[0].column.name).toBe("email");
    }
  });

  it("detects dropped column", () => {
    const idCol = col({ name: "id", type: "SERIAL" });
    const emailCol = col({ name: "email", type: "VARCHAR(255)" });

    const previous: SchemaSnapshot = {
      users: { name: "users", columns: [idCol, emailCol], constraints: [] },
    };
    const current: SchemaSnapshot = {
      users: { name: "users", columns: [idCol], constraints: [] },
    };

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ type: "drop_column", tableName: "users", columnName: "email" });
  });

  it("detects altered column (type change)", () => {
    const previous: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "name", type: "VARCHAR(100)" })],
        constraints: [],
      },
    };
    const current: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "name", type: "TEXT" })],
        constraints: [],
      },
    };

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("alter_column");
    if (ops[0].type === "alter_column") {
      expect(ops[0].from.type).toBe("VARCHAR(100)");
      expect(ops[0].to.type).toBe("TEXT");
    }
  });

  it("detects altered column (nullable change)", () => {
    const previous: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "email", type: "VARCHAR(255)", nullable: true })],
        constraints: [],
      },
    };
    const current: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "email", type: "VARCHAR(255)", nullable: false })],
        constraints: [],
      },
    };

    const ops = diffSchemas(previous, current);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("alter_column");
  });

  it("returns empty for identical schemas", () => {
    const schema: SchemaSnapshot = {
      users: {
        name: "users",
        columns: [col({ name: "id", type: "SERIAL" })],
        constraints: [],
      },
    };

    const ops = diffSchemas(schema, schema);
    expect(ops).toHaveLength(0);
  });

  it("drops come before creates", () => {
    const previous: SchemaSnapshot = {
      old_table: { name: "old_table", columns: [], constraints: [] },
    };
    const current: SchemaSnapshot = {
      new_table: { name: "new_table", columns: [], constraints: [] },
    };

    const ops = diffSchemas(previous, current);
    expect(ops[0].type).toBe("drop_table");
    expect(ops[1].type).toBe("create_table");
  });
});
