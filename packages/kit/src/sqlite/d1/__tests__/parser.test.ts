import { describe, it, expect } from "vitest";
import { parseSchemaFiles } from "../parser";

describe("d1 parseSchemaFiles", () => {
  it("parses a basic CREATE TABLE", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: `
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot.users).toBeDefined();
    expect(snapshot.users.columns).toHaveLength(3);

    const id = snapshot.users.columns[0];
    expect(id.name).toBe("id");
    expect(id.type).toBe("INTEGER");
    expect(id.primaryKey).toBe(true);
    expect(id.nullable).toBe(false);

    const email = snapshot.users.columns[2];
    expect(email.unique).toBe(true);
  });

  it("parses DEFAULT values", () => {
    const result = parseSchemaFiles([
      {
        filename: "posts.sql",
        content: `
          CREATE TABLE posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            published INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    const published = snapshot.posts.columns[1];
    expect(published.default).toBe("0");
  });

  it("parses REFERENCES", () => {
    const result = parseSchemaFiles([
      {
        filename: "posts.sql",
        content: `
          CREATE TABLE posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL REFERENCES users(id)
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    const authorId = snapshot.posts.columns[1];
    expect(authorId.references).toEqual({ table: "users", column: "id" });
  });

  it("parses multiple tables from multiple files", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      },
      {
        filename: "posts.sql",
        content: "CREATE TABLE posts (id INTEGER PRIMARY KEY);",
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(Object.keys(snapshot)).toEqual(["users", "posts"]);
  });

  it("strips SQL comments", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: `
          -- This is a comment
          CREATE TABLE users (
            id INTEGER PRIMARY KEY, -- inline comment
            /* block comment */
            name TEXT NOT NULL
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot.users.columns).toHaveLength(2);
  });

  it("errors on duplicate table names", () => {
    const result = parseSchemaFiles([
      {
        filename: "a.sql",
        content: "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      },
      {
        filename: "b.sql",
        content: "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      },
    ]);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("Duplicate table");
  });

  it("handles nullable columns", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: `
          CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            bio TEXT
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const bio = result._unsafeUnwrap().users.columns[1];
    expect(bio.nullable).toBe(true);
  });

  it("handles IF NOT EXISTS", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY);",
      },
    ]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().users).toBeDefined();
  });

  it("handles composite primary key", () => {
    const result = parseSchemaFiles([
      {
        filename: "tags.sql",
        content: `
          CREATE TABLE post_tags (
            post_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (post_id, tag_id)
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const table = result._unsafeUnwrap().post_tags;
    expect(table.constraints).toHaveLength(1);
    expect(table.constraints[0].type).toBe("primary_key");
    expect(table.constraints[0].columns).toEqual(["post_id", "tag_id"]);
    expect(table.columns[0].primaryKey).toBe(true);
    expect(table.columns[1].primaryKey).toBe(true);
  });

  it("returns empty snapshot for no SQL files", () => {
    const result = parseSchemaFiles([]);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({});
  });
});
