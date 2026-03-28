import type { SchemaSnapshot, ColumnDef, Operation } from "./types";

function columnsEqual(a: ColumnDef, b: ColumnDef): boolean {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    a.default === b.default &&
    a.primaryKey === b.primaryKey &&
    a.unique === b.unique &&
    JSON.stringify(a.references) === JSON.stringify(b.references)
  );
}

export function diffSchemas(
  previous: SchemaSnapshot,
  current: SchemaSnapshot,
): Operation[] {
  const ops: Operation[] = [];

  const prevTables = new Set(Object.keys(previous));
  const currTables = new Set(Object.keys(current));

  // Drop tables (previous but not current) — drops first to avoid dependency issues
  for (const name of prevTables) {
    if (!currTables.has(name)) {
      ops.push({ type: "drop_table", tableName: name });
    }
  }

  // Create tables (current but not previous)
  for (const name of currTables) {
    if (!prevTables.has(name)) {
      ops.push({ type: "create_table", table: current[name] });
    }
  }

  // Diff columns for tables that exist in both
  for (const name of currTables) {
    if (!prevTables.has(name)) continue;

    const prevTable = previous[name];
    const currTable = current[name];

    const prevCols = new Map(prevTable.columns.map((c) => [c.name, c]));
    const currCols = new Map(currTable.columns.map((c) => [c.name, c]));

    // Drop columns
    for (const [colName] of prevCols) {
      if (!currCols.has(colName)) {
        ops.push({ type: "drop_column", tableName: name, columnName: colName });
      }
    }

    // Add columns
    for (const [colName, col] of currCols) {
      if (!prevCols.has(colName)) {
        ops.push({ type: "add_column", tableName: name, column: col });
      }
    }

    // Alter columns
    for (const [colName, currCol] of currCols) {
      const prevCol = prevCols.get(colName);
      if (prevCol && !columnsEqual(prevCol, currCol)) {
        ops.push({
          type: "alter_column",
          tableName: name,
          columnName: colName,
          from: prevCol,
          to: currCol,
        });
      }
    }
  }

  return ops;
}
