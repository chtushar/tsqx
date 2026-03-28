import { ok, err, type Result } from "neverthrow";
import { QueryError } from "../errors";
import type { SchemaSnapshot } from "../schema/types";
import type { QueryDef, QueryCommand, QueryParam } from "./types";

const QUERY_ANNOTATION = /^--\s*name:\s*(\w+)\s+:(one|many|exec|execrows|execresult)\s*$/i;

function stripComments(sql: string): string {
  // Remove block comments but not annotation comments
  return sql.replace(/\/\*[\s\S]*?\*\//g, "");
}

function resolveParamType(
  sql: string,
  paramIndex: number,
  snapshot: SchemaSnapshot,
): { name: string; sqlType: string } | null {
  // Try to match $N against column references in WHERE, SET, VALUES, etc.
  const paramPlaceholder = `\\$${paramIndex}`;

  // Pattern: column = $N or column=$N
  const whereMatch = sql.match(
    new RegExp(`(\\w+)\\s*=\\s*${paramPlaceholder}(?:\\s|,|\\)|;|$)`, "i"),
  );
  if (whereMatch) {
    const columnName = whereMatch[1].toLowerCase();
    return findColumnInSnapshot(columnName, sql, snapshot);
  }

  // Pattern: VALUES (..., $N, ...) — match by position against INSERT column list
  const insertMatch = sql.match(
    /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
  );
  if (insertMatch) {
    const columns = insertMatch[2].split(",").map((c) => c.trim().toLowerCase());
    const values = insertMatch[3].split(",").map((v) => v.trim());
    const paramPos = values.findIndex((v) => v === `$${paramIndex}`);
    if (paramPos !== -1 && paramPos < columns.length) {
      const tableName = insertMatch[1].toLowerCase();
      const columnName = columns[paramPos];
      const table = snapshot[tableName];
      if (table) {
        const col = table.columns.find((c) => c.name === columnName);
        if (col) {
          return { name: columnName, sqlType: col.type };
        }
      }
    }
  }

  return null;
}

function findColumnInSnapshot(
  columnName: string,
  sql: string,
  snapshot: SchemaSnapshot,
): { name: string; sqlType: string } | null {
  // Extract table name from FROM or UPDATE or INSERT INTO
  const tableMatch = sql.match(
    /(?:FROM|UPDATE|INSERT\s+INTO)\s+(\w+)/i,
  );
  if (!tableMatch) return null;

  const tableName = tableMatch[1].toLowerCase();
  const table = snapshot[tableName];
  if (!table) return null;

  const col = table.columns.find((c) => c.name === columnName);
  if (!col) return null;

  return { name: columnName, sqlType: col.type };
}

function extractParams(
  sql: string,
  snapshot: SchemaSnapshot,
): QueryParam[] {
  const paramMatches = sql.match(/\$\d+/g);
  if (!paramMatches) return [];

  const indices = [...new Set(paramMatches.map((p) => parseInt(p.slice(1), 10)))].sort(
    (a, b) => a - b,
  );

  return indices.map((index) => {
    const resolved = resolveParamType(sql, index, snapshot);
    return {
      index,
      name: resolved?.name ?? `param${index}`,
      sqlType: resolved?.sqlType ?? "TEXT",
    };
  });
}

function resolveReturnsTable(sql: string, snapshot: SchemaSnapshot): string | null {
  // SELECT * FROM table or SELECT ... FROM table
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  if (fromMatch) {
    const tableName = fromMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  // INSERT INTO table ... RETURNING
  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch && /RETURNING/i.test(sql)) {
    const tableName = insertMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  // UPDATE table ... RETURNING
  const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
  if (updateMatch && /RETURNING/i.test(sql)) {
    const tableName = updateMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  return null;
}

function resolveReturnsColumns(sql: string, tableName: string | null, snapshot: SchemaSnapshot): string[] {
  if (!tableName || !snapshot[tableName]) return [];

  // SELECT * or RETURNING *
  if (/SELECT\s+\*/i.test(sql) || /RETURNING\s+\*/i.test(sql)) {
    return snapshot[tableName].columns.map((c) => c.name);
  }

  // SELECT col1, col2 FROM table
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return selectMatch[1]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c !== "*");
  }

  // RETURNING col1, col2
  const returningMatch = sql.match(/RETURNING\s+(.+?)(?:;|\s*$)/i);
  if (returningMatch) {
    return returningMatch[1]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c !== "*");
  }

  return [];
}

export function parseQueryFile(
  filename: string,
  content: string,
  snapshot: SchemaSnapshot,
): Result<QueryDef[], QueryError> {
  const clean = stripComments(content);
  const lines = clean.split("\n");
  const queries: QueryDef[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(QUERY_ANNOTATION);

    if (match) {
      const name = match[1];
      const command = match[2].toLowerCase() as QueryCommand;

      // Collect SQL lines until the next annotation or end of file
      const sqlLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (QUERY_ANNOTATION.test(nextLine)) break;
        if (nextLine) sqlLines.push(nextLine);
        i++;
      }

      const sql = sqlLines.join("\n");
      if (!sql) {
        return err(new QueryError(`Empty query body for "${name}" in ${filename}`));
      }

      const params = extractParams(sql, snapshot);
      const returnsTable = resolveReturnsTable(sql, snapshot);
      const returnsColumns = resolveReturnsColumns(sql, returnsTable, snapshot);

      queries.push({
        name,
        command,
        sql,
        params,
        returnsTable,
        returnsColumns,
        sourceFile: filename,
      });
    } else {
      i++;
    }
  }

  return ok(queries);
}

export function parseQueryFiles(
  files: Array<{ filename: string; content: string }>,
  snapshot: SchemaSnapshot,
): Result<QueryDef[], QueryError> {
  const allQueries: QueryDef[] = [];

  for (const file of files) {
    const result = parseQueryFile(file.filename, file.content, snapshot);
    if (result.isErr()) return result;
    allQueries.push(...result.value);
  }

  // Check for duplicate names
  const names = new Set<string>();
  for (const query of allQueries) {
    if (names.has(query.name)) {
      return err(new QueryError(`Duplicate query name "${query.name}" in ${query.sourceFile}`));
    }
    names.add(query.name);
  }

  return ok(allQueries);
}
