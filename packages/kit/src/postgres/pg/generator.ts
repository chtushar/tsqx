import type { Operation, ColumnDef, TableDef } from "@tsqx/core";

function columnToSQL(col: ColumnDef): string {
  const parts = [col.name, col.type];

  if (col.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  if (!col.nullable && !col.primaryKey) {
    parts.push("NOT NULL");
  }

  if (col.unique) {
    parts.push("UNIQUE");
  }

  if (col.default !== undefined) {
    parts.push(`DEFAULT ${col.default}`);
  }

  if (col.references) {
    parts.push(`REFERENCES ${col.references.table}(${col.references.column})`);
  }

  return parts.join(" ");
}

function createTableSQL(table: TableDef): string {
  const cols = table.columns.map((c) => `  ${columnToSQL(c)}`);

  // Add table-level constraints that aren't already expressed inline
  for (const constraint of table.constraints) {
    const name = constraint.name ? `CONSTRAINT ${constraint.name} ` : "";
    if (constraint.type === "primary_key") {
      // Skip if single-column PK (already inline)
      if (constraint.columns.length > 1) {
        cols.push(`  ${name}PRIMARY KEY (${constraint.columns.join(", ")})`);
      }
    } else if (constraint.type === "unique") {
      if (constraint.columns.length > 1) {
        cols.push(`  ${name}UNIQUE (${constraint.columns.join(", ")})`);
      }
    } else if (constraint.type === "foreign_key" && constraint.references) {
      cols.push(
        `  ${name}FOREIGN KEY (${constraint.columns.join(", ")}) REFERENCES ${constraint.references.table}(${constraint.references.columns.join(", ")})`,
      );
    }
  }

  return `CREATE TABLE ${table.name} (\n${cols.join(",\n")}\n);`;
}

function operationToSQL(op: Operation): string {
  switch (op.type) {
    case "create_table":
      return createTableSQL(op.table);

    case "drop_table":
      return `DROP TABLE IF EXISTS ${op.tableName};`;

    case "add_column":
      return `ALTER TABLE ${op.tableName} ADD COLUMN ${columnToSQL(op.column)};`;

    case "drop_column":
      return `ALTER TABLE ${op.tableName} DROP COLUMN ${op.columnName};`;

    case "alter_column": {
      const stmts: string[] = [];
      const { tableName, columnName, from, to } = op;

      if (from.type !== to.type) {
        stmts.push(
          `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DATA TYPE ${to.type};`,
        );
      }

      if (from.nullable && !to.nullable) {
        stmts.push(
          `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`,
        );
      } else if (!from.nullable && to.nullable) {
        stmts.push(
          `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP NOT NULL;`,
        );
      }

      if (from.default !== to.default) {
        if (to.default !== undefined) {
          stmts.push(
            `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DEFAULT ${to.default};`,
          );
        } else {
          stmts.push(
            `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP DEFAULT;`,
          );
        }
      }

      if (!from.unique && to.unique) {
        stmts.push(
          `ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${columnName}_unique UNIQUE (${columnName});`,
        );
      } else if (from.unique && !to.unique) {
        stmts.push(
          `ALTER TABLE ${tableName} DROP CONSTRAINT ${tableName}_${columnName}_unique;`,
        );
      }

      return stmts.join("\n");
    }
  }
}

export function generateSQL(operations: Operation[]): string {
  if (operations.length === 0) return "";

  const statements = operations.map(operationToSQL).filter(Boolean);
  return `BEGIN;\n\n${statements.join("\n\n")}\n\nCOMMIT;\n`;
}
