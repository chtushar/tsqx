import { ok, err, type Result } from "neverthrow";
import { SchemaError, type SchemaSnapshot, type TableDef, type ColumnDef, type TableConstraint } from "@tsqx/core";

/** Normalize a SQL identifier: preserve casing if double-quoted, lowercase otherwise. */
function normalizeId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toLowerCase();
}

function stripComments(sql: string): string {
  // Remove block comments
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments
  sql = sql.replace(/--.*$/gm, "");
  return sql;
}

function parseColumnDef(raw: string): ColumnDef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match: "quotedName" or unquotedName followed by TYPE ...rest
  const match = trimmed.match(/^("(\w+)"|(\w+))\s+(.+)$/is);
  if (!match) return null;

  // Quoted names preserve casing, unquoted get lowercased
  const name = match[2] ?? match[3].toLowerCase();
  const rest = match[4].trim();

  // Extract the type — single word, optionally followed by known multi-word suffixes
  // e.g. DOUBLE PRECISION, CHARACTER VARYING, TIME ZONE, WITH TIME ZONE
  const typeMatch = rest.match(
    /^(\w+(?:\s+(?:PRECISION|VARYING|ZONE|WITHOUT|WITH(?:\s+TIME\s+ZONE)?))?(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])?)/i,
  );
  if (!typeMatch) return null;

  const type = typeMatch[1].toUpperCase();
  const modifiers = rest.slice(typeMatch[0].length).trim().toUpperCase();

  const nullable = !modifiers.includes("NOT NULL");
  const primaryKey = modifiers.includes("PRIMARY KEY");
  const unique = modifiers.includes("UNIQUE");

  let defaultValue: string | undefined;
  const defaultMatch = rest
    .slice(typeMatch[0].length)
    .match(/DEFAULT\s+(.+?)(?:\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|CONSTRAINT)|\s*$)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1].trim();
  }

  let references: ColumnDef["references"];
  const restModifiers = rest.slice(typeMatch[0].length).trim();
  const refMatch = restModifiers.match(
    /REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i,
  );
  if (refMatch) {
    // Unquoted identifiers get lowercased, quoted preserve casing
    const refTable = restModifiers.includes(`"${refMatch[1]}"`) ? refMatch[1] : refMatch[1].toLowerCase();
    const refCol = restModifiers.includes(`"${refMatch[2]}"`) ? refMatch[2] : refMatch[2].toLowerCase();
    references = { table: refTable, column: refCol };
  }

  return {
    name,
    type,
    nullable: primaryKey ? false : nullable,
    ...(defaultValue !== undefined && { default: defaultValue }),
    primaryKey,
    unique,
    ...(references && { references }),
  };
}

function isTableConstraint(line: string): boolean {
  const upper = line.trim().toUpperCase();
  return (
    upper.startsWith("PRIMARY KEY") ||
    upper.startsWith("UNIQUE") ||
    upper.startsWith("FOREIGN KEY") ||
    upper.startsWith("CONSTRAINT") ||
    upper.startsWith("CHECK")
  );
}

function parseTableConstraint(raw: string): TableConstraint | null {
  const trimmed = raw.trim().toUpperCase();

  // CONSTRAINT name ... or direct
  let working = trimmed;
  let name: string | undefined;
  const constraintMatch = raw
    .trim()
    .match(/^CONSTRAINT\s+"?(\w+)"?\s+(.+)$/is);
  if (constraintMatch) {
    name = constraintMatch[1].toLowerCase();
    working = constraintMatch[2].trim().toUpperCase();
  }

  const colsMatch = working.match(/\(\s*(.+?)\s*\)/);
  if (!colsMatch) return null;
  const columns = colsMatch[1]
    .split(",")
    .map((c) => {
      const trimmed = c.trim();
      // Quoted: preserve casing. Unquoted: lowercase.
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
      }
      return trimmed.replace(/"/g, "").toLowerCase();
    });

  if (working.startsWith("PRIMARY KEY")) {
    return { type: "primary_key", ...(name && { name }), columns };
  }

  if (working.startsWith("UNIQUE")) {
    return { type: "unique", ...(name && { name }), columns };
  }

  if (working.startsWith("FOREIGN KEY")) {
    const refMatch = working.match(
      /REFERENCES\s+"?(\w+)"?\s*\(\s*(.+?)\s*\)/i,
    );
    if (!refMatch) return null;
    const refColumns = refMatch[2]
      .split(",")
      .map((c) => {
        const trimmed = c.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1);
        }
        return trimmed.replace(/"/g, "").toLowerCase();
      });
    return {
      type: "foreign_key",
      ...(name && { name }),
      columns,
      references: { table: refMatch[1].toLowerCase(), columns: refColumns },
    };
  }

  return null;
}

function parseCreateTable(sql: string): Result<TableDef, SchemaError> {
  const tableMatch = sql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("(\w+)"|(\w+))\s*\(([\s\S]+)\)/i,
  );
  if (!tableMatch) {
    return err(new SchemaError(`Failed to parse CREATE TABLE statement`));
  }

  // Quoted table names preserve casing, unquoted get lowercased
  const tableName = tableMatch[2] ?? tableMatch[3].toLowerCase();
  const body = tableMatch[4];

  // Split body by commas, respecting parentheses
  const lines: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === "," && depth === 0) {
      lines.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current.trim());

  const columns: ColumnDef[] = [];
  const constraints: TableConstraint[] = [];

  for (const line of lines) {
    if (isTableConstraint(line)) {
      const constraint = parseTableConstraint(line);
      if (constraint) constraints.push(constraint);
    } else {
      const column = parseColumnDef(line);
      if (column) columns.push(column);
    }
  }

  // Apply table-level primary key to columns
  const pkConstraint = constraints.find((c) => c.type === "primary_key");
  if (pkConstraint) {
    for (const col of columns) {
      if (pkConstraint.columns.includes(col.name)) {
        col.primaryKey = true;
        col.nullable = false;
      }
    }
  }

  return ok({ name: tableName, columns, constraints });
}

export function parseSchemaFiles(
  files: Array<{ filename: string; content: string }>,
): Result<SchemaSnapshot, SchemaError> {
  const snapshot: SchemaSnapshot = {};

  for (const file of files) {
    const clean = stripComments(file.content);

    // Extract all CREATE TABLE statements
    const regex =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s*\([\s\S]*?\);/gi;
    const matches = clean.match(regex);

    if (!matches) continue;

    for (const statement of matches) {
      const result = parseCreateTable(statement);
      if (result.isErr()) {
        return err(
          new SchemaError(`Error in ${file.filename}: ${result.error.message}`),
        );
      }

      const table = result.value;
      if (snapshot[table.name]) {
        return err(
          new SchemaError(
            `Duplicate table "${table.name}" found in ${file.filename}`,
          ),
        );
      }
      snapshot[table.name] = table;
    }
  }

  return ok(snapshot);
}
