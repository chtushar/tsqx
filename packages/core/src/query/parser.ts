import { ok, err, type Result } from "neverthrow";
import { QueryError } from "../errors";
import type { SchemaSnapshot } from "../schema/types";
import type { QueryDef, QueryCommand, QueryParam, MixinDef } from "./types";

const QUERY_ANNOTATION = /^--\s*@name\s+(\w+)\s+:(one|many|exec|execrows|execresult)\s*$/i;
const MIXIN_ANNOTATION = /^--\s*@mixin\s+(\w+)\(([^)]*)\)\s*$/i;
const INCLUDE_DIRECTIVE = /--\s*@include\s+(\w+)/i;

function stripBlockComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "");
}

function isDirective(line: string): boolean {
  return QUERY_ANNOTATION.test(line) || MIXIN_ANNOTATION.test(line);
}

// --- Mixin expansion ---

function expandMixins(
  sql: string,
  mixins: Map<string, MixinDef>,
  sourceFile: string,
): Result<string, QueryError> {
  let expanded = sql;
  let iterations = 0;
  const maxIterations = 10;

  while (INCLUDE_DIRECTIVE.test(expanded)) {
    if (iterations++ >= maxIterations) {
      return err(new QueryError(`Circular @include detected in ${sourceFile}`));
    }

    expanded = expanded.replace(INCLUDE_DIRECTIVE, (_, mixinName) => {
      const mixin = mixins.get(mixinName);
      if (!mixin) return `/* ERROR: unknown mixin "${mixinName}" */`;
      return mixin.body;
    });
  }

  return ok(expanded);
}

// --- Named param resolution ---

interface InlineTypeHint {
  name: string;
  sqlType: string;
}

function extractInlineTypeHints(sql: string): { cleaned: string; hints: InlineTypeHint[] } {
  const hints: InlineTypeHint[] = [];
  // Match $name::type patterns and strip the ::type part
  // Type is a single word optionally followed by (N) — no multi-word to avoid eating AND/IS/etc.
  const cleaned = sql.replace(
    /\$([a-zA-Z_]\w*)::(\w+(?:\(\d+\))?)/g,
    (_, name, type) => {
      hints.push({ name, sqlType: type.toUpperCase() });
      return `$${name}`;
    },
  );
  return { cleaned, hints };
}

function extractNamedParams(sql: string): string[] {
  const matches = sql.match(/\$([a-zA-Z_]\w*)/g);
  if (!matches) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of matches) {
    const name = m.slice(1);
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function namedToPositional(sql: string, paramNames: string[]): string {
  let result = sql;
  for (let i = 0; i < paramNames.length; i++) {
    result = result.replace(
      new RegExp(`\\$${paramNames[i]}(?![a-zA-Z_\\d])`, "g"),
      `$${i + 1}`,
    );
  }
  return result;
}

function addNullableCasts(sql: string, params: QueryParam[]): string {
  let result = sql;
  for (const param of params) {
    if (!param.nullable) continue;
    const pgType = param.sqlType.toLowerCase();
    // Cast the first occurrence in IS NULL pattern: $N IS NULL → $N::type IS NULL
    // Use a function replacement to avoid $1 backreference issues
    result = result.replace(
      new RegExp(`\\$${param.index}(\\s+IS\\s+NULL)`, "i"),
      (_, isNull) => "$" + param.index + "::" + pgType + isNull,
    );
  }
  return result;
}

function resolveParamType(
  paramName: string,
  sql: string,
  snapshot: SchemaSnapshot,
  mixinParams: Map<string, { nullable: boolean; sqlType?: string }>,
): { sqlType: string; nullable: boolean } {
  const mixinParam = mixinParams.get(paramName);
  const isNullable = mixinParam?.nullable ?? false;

  // If mixin provides an explicit type annotation, use it
  if (mixinParam?.sqlType) {
    return { sqlType: mixinParam.sqlType, nullable: isNullable };
  }

  // Try to find the column this param maps to
  // Pattern: column = $param or column=$param
  const colMatch = sql.match(
    new RegExp(`"?(\\w+)"?\\s*=\\s*\\$${paramName}(?![a-zA-Z_\\d])`, "i"),
  );
  if (colMatch) {
    const columnName = colMatch[1].toLowerCase();
    const resolved = findColumnInSnapshot(columnName, sql, snapshot);
    if (resolved) {
      return { sqlType: resolved.sqlType, nullable: isNullable };
    }
  }

  // Pattern: INSERT INTO table (cols) VALUES ($params) — match by name
  const insertMatch = sql.match(
    /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
  );
  if (insertMatch) {
    const tableName = insertMatch[1].toLowerCase();
    const columns = insertMatch[2].split(",").map((c) => c.trim().toLowerCase());
    const values = insertMatch[3].split(",").map((v) => v.trim());
    const paramPos = values.findIndex(
      (v) => v === `$${paramName}` || v.startsWith(`$${paramName}:`),
    );
    if (paramPos !== -1 && paramPos < columns.length) {
      const table = snapshot[tableName];
      if (table) {
        const col = table.columns.find((c) => c.name === columns[paramPos]);
        if (col) {
          return { sqlType: col.type, nullable: isNullable };
        }
      }
    }
  }

  // Pattern: ILIKE '%' || $param || '%' — likely a text param
  const ilikeMatch = sql.match(
    new RegExp(`ILIKE.*\\$${paramName}`, "i"),
  );
  if (ilikeMatch) {
    return { sqlType: "TEXT", nullable: isNullable };
  }

  return { sqlType: "TEXT", nullable: isNullable };
}

function findColumnInSnapshot(
  columnName: string,
  sql: string,
  snapshot: SchemaSnapshot,
): { name: string; sqlType: string } | null {
  // Try all tables referenced in the query
  const tableMatches = sql.matchAll(
    /(?:FROM|UPDATE|INSERT\s+INTO|JOIN)\s+(\w+)/gi,
  );

  for (const match of tableMatches) {
    const tableName = match[1].toLowerCase();
    const table = snapshot[tableName];
    if (!table) continue;

    const col = table.columns.find((c) => c.name === columnName);
    if (col) return { name: columnName, sqlType: col.type };
  }

  return null;
}

function resolveReturnsTable(sql: string, snapshot: SchemaSnapshot): string | null {
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  if (fromMatch) {
    const tableName = fromMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch && /RETURNING/i.test(sql)) {
    const tableName = insertMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
  if (updateMatch && /RETURNING/i.test(sql)) {
    const tableName = updateMatch[1].toLowerCase();
    if (snapshot[tableName]) return tableName;
  }

  return null;
}

function resolveReturnsColumns(sql: string, tableName: string | null, snapshot: SchemaSnapshot): string[] {
  if (!tableName || !snapshot[tableName]) return [];

  if (/SELECT\s+\*/i.test(sql) || /RETURNING\s+\*/i.test(sql)) {
    return snapshot[tableName].columns.map((c) => c.name);
  }

  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return selectMatch[1]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c !== "*");
  }

  const returningMatch = sql.match(/RETURNING\s+(.+?)(?:;|\s*$)/i);
  if (returningMatch) {
    return returningMatch[1]
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c !== "*");
  }

  return [];
}

// --- SQL validation ---

function validateExpandedSql(sql: string, queryName: string): Result<void, QueryError> {
  const trimmed = sql.trim();

  // Must end with semicolon
  if (!trimmed.endsWith(";")) {
    return err(new QueryError(`Query "${queryName}" does not end with a semicolon`));
  }

  // Must start with a valid SQL keyword
  const validStarts = /^(SELECT|INSERT|UPDATE|DELETE|WITH)\s/i;
  if (!validStarts.test(trimmed)) {
    return err(new QueryError(`Query "${queryName}" does not start with a valid SQL statement`));
  }

  // Check for unresolved @include directives
  if (INCLUDE_DIRECTIVE.test(trimmed)) {
    return err(new QueryError(`Query "${queryName}" has unresolved @include directives`));
  }

  // Check for unresolved named params (should all be converted to positional)
  // This is checked on the positional version, so skip here

  // Check balanced parentheses
  let depth = 0;
  for (const char of trimmed) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) {
      return err(new QueryError(`Query "${queryName}" has unbalanced parentheses`));
    }
  }
  if (depth !== 0) {
    return err(new QueryError(`Query "${queryName}" has unbalanced parentheses`));
  }

  return ok(undefined);
}

// --- Main parser ---

function collectBody(lines: string[], startIndex: number): { body: string; endIndex: number } {
  const sqlLines: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const nextLine = lines[i].trim();
    if (isDirective(nextLine)) break;
    if (nextLine) sqlLines.push(nextLine);
    i++;
  }
  return { body: sqlLines.join("\n"), endIndex: i };
}

export function parseQueryFile(
  filename: string,
  content: string,
  snapshot: SchemaSnapshot,
): Result<{ queries: QueryDef[]; mixins: MixinDef[] }, QueryError> {
  const clean = stripBlockComments(content);
  const lines = clean.split("\n");
  const queries: QueryDef[] = [];
  const mixins: MixinDef[] = [];
  const mixinMap = new Map<string, MixinDef>();

  // First pass: collect mixins
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const mixinMatch = line.match(MIXIN_ANNOTATION);

    if (mixinMatch) {
      const name = mixinMatch[1];
      const rawParams = mixinMatch[2].trim();
      const params = rawParams
        ? rawParams.split(",").map((p) => {
            const trimmed = p.trim().replace(/^\$/, "");
            const nullable = trimmed.endsWith("?");
            const clean = nullable ? trimmed.slice(0, -1) : trimmed;
            // Support $name::type syntax
            const typeMatch = clean.match(/^(\w+)::(\w+(?:\s+\w+)?(?:\(\d+\))?)$/);
            if (typeMatch) {
              return {
                name: typeMatch[1],
                nullable,
                sqlType: typeMatch[2].toUpperCase(),
              };
            }
            return {
              name: clean,
              nullable,
            };
          })
        : [];

      i++;
      const { body, endIndex } = collectBody(lines, i);
      i = endIndex;

      const mixin: MixinDef = { name, params, body, sourceFile: filename };
      mixins.push(mixin);
      mixinMap.set(name, mixin);
    } else {
      i++;
    }
  }

  // Second pass: collect queries
  i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const queryMatch = line.match(QUERY_ANNOTATION);

    if (queryMatch) {
      const name = queryMatch[1];
      const command = queryMatch[2].toLowerCase() as QueryCommand;

      i++;
      // Collect SQL lines — allow @include inline
      const sqlLines: string[] = [];
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (isDirective(nextLine)) break;
        if (nextLine) sqlLines.push(nextLine);
        i++;
      }

      const rawSql = sqlLines.join("\n");
      if (!rawSql) {
        return err(new QueryError(`Empty query body for "${name}" in ${filename}`));
      }

      // Expand mixins
      const expandResult = expandMixins(rawSql, mixinMap, filename);
      if (expandResult.isErr()) return err(expandResult.error);
      const expandedSql = expandResult.value;

      // Extract inline type hints ($name::type) and strip them from SQL
      const { cleaned: cleanedSql, hints: inlineHints } = extractInlineTypeHints(expandedSql);

      // Validate the cleaned SQL
      const validationResult = validateExpandedSql(cleanedSql, name);
      if (validationResult.isErr()) return err(validationResult.error);

      // Collect param info from mixins (nullable + type annotations)
      const mixinParamInfo = new Map<string, { nullable: boolean; sqlType?: string }>();
      for (const mixin of mixins) {
        for (const p of mixin.params) {
          mixinParamInfo.set(p.name, { nullable: p.nullable, sqlType: p.sqlType });
        }
      }
      // Inline type hints override mixin/inferred types
      for (const hint of inlineHints) {
        const existing = mixinParamInfo.get(hint.name);
        mixinParamInfo.set(hint.name, {
          nullable: existing?.nullable ?? false,
          sqlType: hint.sqlType,
        });
      }

      // Extract named params and convert to positional
      const namedParams = extractNamedParams(cleanedSql);
      let positionalSql = namedToPositional(cleanedSql, namedParams);

      // Resolve param types
      const params: QueryParam[] = namedParams.map((paramName, idx) => {
        const resolved = resolveParamType(paramName, cleanedSql, snapshot, mixinParamInfo);
        return {
          index: idx + 1,
          name: paramName,
          sqlType: resolved.sqlType,
          nullable: resolved.nullable,
        };
      });

      // Add ::type casts for nullable params so PG can infer types
      positionalSql = addNullableCasts(positionalSql, params);

      const returnsTable = resolveReturnsTable(cleanedSql, snapshot);
      const returnsColumns = resolveReturnsColumns(cleanedSql, returnsTable, snapshot);

      queries.push({
        name,
        command,
        sql: rawSql,
        expandedSql: positionalSql,
        params,
        returnsTable,
        returnsColumns,
        sourceFile: filename,
      });
    } else {
      i++;
    }
  }

  return ok({ queries, mixins });
}

export function parseQueryFiles(
  files: Array<{ filename: string; content: string }>,
  snapshot: SchemaSnapshot,
): Result<QueryDef[], QueryError> {
  // First pass: collect all mixins across all files
  const globalMixins = new Map<string, MixinDef>();

  for (const file of files) {
    const clean = stripBlockComments(file.content);
    const lines = clean.split("\n");

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const mixinMatch = line.match(MIXIN_ANNOTATION);

      if (mixinMatch) {
        const name = mixinMatch[1];
        const rawParams = mixinMatch[2].trim();
        const params = rawParams
          ? rawParams.split(",").map((p) => {
              const trimmed = p.trim().replace(/^\$/, "");
              const nullable = trimmed.endsWith("?");
              const clean = nullable ? trimmed.slice(0, -1) : trimmed;
              const typeMatch = clean.match(/^(\w+)::(\w+(?:\s+\w+)?(?:\(\d+\))?)$/);
              if (typeMatch) {
                return { name: typeMatch[1], nullable, sqlType: typeMatch[2].toUpperCase() };
              }
              return { name: clean, nullable };
            })
          : [];

        i++;
        const { body, endIndex } = collectBody(lines, i);
        i = endIndex;

        if (globalMixins.has(name)) {
          return err(new QueryError(`Duplicate mixin name "${name}" in ${file.filename}`));
        }
        globalMixins.set(name, { name, params, body, sourceFile: file.filename });
      } else {
        i++;
      }
    }
  }

  // Second pass: parse queries using global mixins
  const allQueries: QueryDef[] = [];

  for (const file of files) {
    const clean = stripBlockComments(file.content);
    const lines = clean.split("\n");

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const queryMatch = line.match(QUERY_ANNOTATION);

      if (queryMatch) {
        const name = queryMatch[1];
        const command = queryMatch[2].toLowerCase() as QueryCommand;

        i++;
        const sqlLines: string[] = [];
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          if (isDirective(nextLine)) break;
          // Stop after a line ending with ; (statement complete)
          if (nextLine) {
            sqlLines.push(nextLine);
            if (nextLine.endsWith(";")) {
              i++;
              break;
            }
          }
          i++;
        }

        const rawSql = sqlLines.join("\n");
        if (!rawSql) {
          return err(new QueryError(`Empty query body for "${name}" in ${file.filename}`));
        }

        const expandResult = expandMixins(rawSql, globalMixins, file.filename);
        if (expandResult.isErr()) return err(expandResult.error);
        const expandedSql = expandResult.value;

        const { cleaned: cleanedSql, hints: inlineHints } = extractInlineTypeHints(expandedSql);

        const validationResult = validateExpandedSql(cleanedSql, name);
        if (validationResult.isErr()) return err(validationResult.error);

        const mixinParamInfo = new Map<string, { nullable: boolean; sqlType?: string }>();
        for (const mixin of globalMixins.values()) {
          for (const p of mixin.params) {
            mixinParamInfo.set(p.name, { nullable: p.nullable, sqlType: p.sqlType });
          }
        }
        for (const hint of inlineHints) {
          const existing = mixinParamInfo.get(hint.name);
          mixinParamInfo.set(hint.name, {
            nullable: existing?.nullable ?? false,
            sqlType: hint.sqlType,
          });
        }

        const namedParams = extractNamedParams(cleanedSql);
        let positionalSql = namedToPositional(cleanedSql, namedParams);

        const params: QueryParam[] = namedParams.map((paramName, idx) => {
          const resolved = resolveParamType(paramName, cleanedSql, snapshot, mixinParamInfo);
          return {
            index: idx + 1,
            name: paramName,
            sqlType: resolved.sqlType,
            nullable: resolved.nullable,
          };
        });

        // Add ::type casts for nullable params so PG can infer types
        positionalSql = addNullableCasts(positionalSql, params);

        const returnsTable = resolveReturnsTable(cleanedSql, snapshot);
        const returnsColumns = resolveReturnsColumns(cleanedSql, returnsTable, snapshot);

        allQueries.push({
          name,
          command,
          sql: rawSql,
          expandedSql: positionalSql,
          params,
          returnsTable,
          returnsColumns,
          sourceFile: file.filename,
        });
      } else {
        i++;
      }
    }
  }

  // Check for duplicate query names
  const names = new Set<string>();
  for (const query of allQueries) {
    if (names.has(query.name)) {
      return err(new QueryError(`Duplicate query name "${query.name}" in ${query.sourceFile}`));
    }
    names.add(query.name);
  }

  return ok(allQueries);
}
