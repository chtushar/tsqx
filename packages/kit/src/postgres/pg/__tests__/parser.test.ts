import { describe, it, expect } from "vitest";
import { parseSchemaFiles } from "../parser";

describe("parseSchemaFiles", () => {
  it("parses a basic CREATE TABLE", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: `
          CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE
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
    expect(id.type).toBe("SERIAL");
    expect(id.primaryKey).toBe(true);
    expect(id.nullable).toBe(false);

    const name = snapshot.users.columns[1];
    expect(name.name).toBe("name");
    expect(name.type).toBe("VARCHAR(255)");
    expect(name.nullable).toBe(false);

    const email = snapshot.users.columns[2];
    expect(email.unique).toBe(true);
  });

  it("parses DEFAULT values", () => {
    const result = parseSchemaFiles([
      {
        filename: "posts.sql",
        content: `
          CREATE TABLE posts (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            published BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    const published = snapshot.posts.columns[2];
    expect(published.default).toBe("false");

    const createdAt = snapshot.posts.columns[3];
    expect(createdAt.default).toBe("NOW()");
    expect(createdAt.nullable).toBe(false);
  });

  it("parses REFERENCES", () => {
    const result = parseSchemaFiles([
      {
        filename: "posts.sql",
        content: `
          CREATE TABLE posts (
            id SERIAL PRIMARY KEY,
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
        content: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      },
      {
        filename: "posts.sql",
        content: "CREATE TABLE posts (id SERIAL PRIMARY KEY);",
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
            id SERIAL PRIMARY KEY, -- inline comment
            /* block comment */
            name VARCHAR(255) NOT NULL
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
        content: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      },
      {
        filename: "b.sql",
        content: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
      },
    ]);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("Duplicate table");
  });

  it("parses table-level PRIMARY KEY", () => {
    const result = parseSchemaFiles([
      {
        filename: "orders.sql",
        content: `
          CREATE TABLE order_items (
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            PRIMARY KEY (order_id, product_id)
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    const table = snapshot.order_items;
    expect(table.constraints).toHaveLength(1);
    expect(table.constraints[0].type).toBe("primary_key");
    expect(table.constraints[0].columns).toEqual(["order_id", "product_id"]);

    // Columns should be marked as primaryKey
    expect(table.columns[0].primaryKey).toBe(true);
    expect(table.columns[1].primaryKey).toBe(true);
  });

  it("handles nullable columns", () => {
    const result = parseSchemaFiles([
      {
        filename: "users.sql",
        content: `
          CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            bio TEXT
          );
        `,
      },
    ]);

    expect(result.isOk()).toBe(true);
    const bio = result._unsafeUnwrap().users.columns[1];
    expect(bio.nullable).toBe(true);
  });

  it("returns empty snapshot for no SQL files", () => {
    const result = parseSchemaFiles([]);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({});
  });
});
