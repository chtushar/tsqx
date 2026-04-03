import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../examples/postgres/pg/src/db/migrations");

let container: StartedPostgreSqlContainer;
let client: Client;

async function applyMigrations(client: Client) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    await client.query(sql);
  }
}

describe("e2e: postgres/pg", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();
    await applyMigrations(client);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  describe("migrations", () => {
    it("creates all tables", async () => {
      const result = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      const tables = result.rows.map((r) => r.table_name);
      expect(tables).toContain("users");
      expect(tables).toContain("organizations");
      expect(tables).toContain("organization_members");
      expect(tables).toContain("traces");
      expect(tables).toContain("spans");
      expect(tables).toContain("span_events");
    });

    it("creates users table with correct columns", async () => {
      const result = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);

      const columns = result.rows.map((r) => ({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable,
      }));

      expect(columns).toContainEqual({ name: "id", type: "integer", nullable: "NO" });
      expect(columns).toContainEqual({ name: "name", type: "character varying", nullable: "NO" });
      expect(columns).toContainEqual({ name: "email", type: "character varying", nullable: "NO" });
      expect(columns).toContainEqual({ name: "profile", type: "character varying", nullable: "YES" });
    });

    it("creates unique constraint on users.email", async () => {
      await client.query("INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')");

      await expect(
        client.query("INSERT INTO users (name, email) VALUES ('Bob', 'alice@test.com')"),
      ).rejects.toThrow(/unique/i);

      await client.query("DELETE FROM users WHERE email = 'alice@test.com'");
    });

    it("creates foreign key on organization_members", async () => {
      await expect(
        client.query("INSERT INTO organization_members (organization_id, user_id) VALUES (9999, 9999)"),
      ).rejects.toThrow(/foreign key/i);
    });
  });

  describe("user queries", () => {
    it("CreateUser inserts and returns a user", async () => {
      const sql = "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *;";
      const result = await client.query(sql, ["Alice", "alice@example.com"]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[0].email).toBe("alice@example.com");
      expect(result.rows[0].id).toBeDefined();
      expect(result.rows[0].created_at).toBeDefined();
    });

    it("GetUser returns the user by id", async () => {
      const insertResult = await client.query(
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *;",
        ["Bob", "bob@example.com"],
      );
      const userId = insertResult.rows[0].id;

      const sql = "SELECT * FROM users WHERE id = $1;";
      const result = await client.query(sql, [userId]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Bob");
    });

    it("GetUser returns empty for non-existent id", async () => {
      const sql = "SELECT * FROM users WHERE id = $1;";
      const result = await client.query(sql, [99999]);

      expect(result.rows).toHaveLength(0);
    });

    it("ListUsers returns all users ordered by name", async () => {
      const sql = "SELECT * FROM users ORDER BY name;";
      const result = await client.query(sql);

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      const names = result.rows.map((r) => r.name);
      expect(names).toEqual([...names].sort());
    });

    it("ListUsersPaginated respects limit and offset", async () => {
      // Insert a few more users
      await client.query("INSERT INTO users (name, email) VALUES ($1, $2)", ["Charlie", "charlie@example.com"]);
      await client.query("INSERT INTO users (name, email) VALUES ($1, $2)", ["Dave", "dave@example.com"]);

      const sql = "SELECT * FROM users ORDER BY name LIMIT $1 OFFSET $2;";

      const page1 = await client.query(sql, [2, 0]);
      expect(page1.rows).toHaveLength(2);

      const page2 = await client.query(sql, [2, 2]);
      expect(page2.rows).toHaveLength(2);

      // No overlap
      const page1Ids = page1.rows.map((r) => r.id);
      const page2Ids = page2.rows.map((r) => r.id);
      expect(page1Ids.filter((id: number) => page2Ids.includes(id))).toHaveLength(0);
    });

    it("DeleteUser removes the user", async () => {
      const insertResult = await client.query(
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *;",
        ["ToDelete", "delete@example.com"],
      );
      const userId = insertResult.rows[0].id;

      await client.query("DELETE FROM users WHERE id = $1;", [userId]);

      const result = await client.query("SELECT * FROM users WHERE id = $1;", [userId]);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("trace queries", () => {
    it("UpsertTrace inserts a new trace", async () => {
      const sql = `
        INSERT INTO traces (
          "id", "traceid", "name", "sessionid", "userid", "status",
          "starttime", "endtime", "durationms", "spancount",
          "totalinputtokens", "totaloutputtokens", "totaltokens", "totalcost",
          "tags", "metadata", "createdat", "updatedat"
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, NOW(), NOW()
        )
        ON CONFLICT ("traceid") DO UPDATE SET
          "name" = COALESCE(EXCLUDED."name", traces."name"),
          "spancount" = traces."spancount" + EXCLUDED."spancount",
          "updatedat" = NOW();
      `;

      await client.query(sql, [
        "550e8400-e29b-41d4-a716-446655440000",
        "trace-001",
        "test-trace",
        "session-1",
        "user-1",
        "ok",
        new Date().toISOString(),
        new Date().toISOString(),
        150,
        3,
        100, 200, 300, 50,
        JSON.stringify({ env: "test" }),
        JSON.stringify({ key: "value" }),
      ]);

      const result = await client.query('SELECT * FROM traces WHERE "traceid" = $1', ["trace-001"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("test-trace");
      expect(result.rows[0].spancount).toBe(3);
    });

    it("UpsertTrace updates on conflict", async () => {
      const sql = `
        INSERT INTO traces (
          "id", "traceid", "name", "sessionid", "userid", "status",
          "starttime", "endtime", "durationms", "spancount",
          "totalinputtokens", "totaloutputtokens", "totaltokens", "totalcost",
          "tags", "metadata", "createdat", "updatedat"
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, NOW(), NOW()
        )
        ON CONFLICT ("traceid") DO UPDATE SET
          "name" = COALESCE(EXCLUDED."name", traces."name"),
          "spancount" = traces."spancount" + EXCLUDED."spancount",
          "updatedat" = NOW();
      `;

      // Upsert same traceId with 2 more spans
      await client.query(sql, [
        "660e8400-e29b-41d4-a716-446655440000",
        "trace-001",
        null,
        "session-1",
        "user-1",
        "ok",
        new Date().toISOString(),
        new Date().toISOString(),
        100,
        2,
        50, 100, 150, 25,
        JSON.stringify({}),
        JSON.stringify({}),
      ]);

      const result = await client.query('SELECT * FROM traces WHERE "traceid" = $1', ["trace-001"]);
      expect(result.rows[0].name).toBe("test-trace"); // COALESCE keeps original
      expect(result.rows[0].spancount).toBe(5); // 3 + 2
    });

    it("ListTraces with filters", async () => {
      // Insert another trace
      await client.query(`
        INSERT INTO traces ("id", "traceid", "name", "sessionid", "status", "starttime", "createdat", "updatedat")
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `, [
        "770e8400-e29b-41d4-a716-446655440000",
        "trace-002",
        "other-trace",
        "session-2",
        "error",
        new Date().toISOString(),
      ]);

      // Filter by session_id — cast nullable params for PG type inference
      const sql = `
        SELECT * FROM traces
        WHERE ($1::varchar IS NULL OR "sessionid" = $1)
        AND ($2::varchar IS NULL OR "userid" = $2)
        AND ($3::varchar IS NULL OR "status" = $3)
        AND ($4::text IS NULL OR "name" ILIKE '%' || $4 || '%')
        AND ($5::timestamp IS NULL OR "starttime" >= $5)
        AND ($6::timestamp IS NULL OR "starttime" <= $6)
        AND ($7::jsonb IS NULL OR "tags" @> $7)
        ORDER BY "starttime" DESC
        LIMIT $8 OFFSET $9;
      `;

      // Filter by session-1
      const result = await client.query(sql, [
        "session-1", null, null, null, null, null, null, 10, 0,
      ]);

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.every((r) => r.sessionid === "session-1")).toBe(true);
    });

    it("CountTraces returns correct count", async () => {
      const sql = `
        SELECT COUNT(*)::integer as total FROM traces
        WHERE ($1::varchar IS NULL OR "sessionid" = $1)
        AND ($2::varchar IS NULL OR "userid" = $2)
        AND ($3::varchar IS NULL OR "status" = $3)
        AND ($4::text IS NULL OR "name" ILIKE '%' || $4 || '%')
        AND ($5::timestamp IS NULL OR "starttime" >= $5)
        AND ($6::timestamp IS NULL OR "starttime" <= $6)
        AND ($7::jsonb IS NULL OR "tags" @> $7);
      `;

      // Count all
      const allResult = await client.query(sql, [null, null, null, null, null, null, null]);
      expect(allResult.rows[0].total).toBeGreaterThanOrEqual(2);

      // Count errors only
      const errorResult = await client.query(sql, [null, null, "error", null, null, null, null]);
      expect(errorResult.rows[0].total).toBe(1);
    });

    it("GetTraceStats returns aggregates", async () => {
      const sql = `
        SELECT
          COUNT(*)::integer AS "totalTraces",
          COALESCE(AVG("durationms"), 0)::integer AS "avgDurationMs",
          COUNT(CASE WHEN "status" = 'error' THEN 1 END)::integer AS "errorCount",
          COALESCE(SUM("totalcost"), 0)::integer AS "totalCost",
          COALESCE(SUM("totaltokens"), 0)::integer AS "totalTokens",
          COALESCE(SUM("spancount"), 0)::integer AS "totalSpans"
        FROM traces
        WHERE "starttime" >= $1 AND "starttime" <= $2
        AND ($3::varchar IS NULL OR "sessionid" = $3)
        AND ($4::varchar IS NULL OR "userid" = $4);
      `;

      const result = await client.query(sql, [
        new Date(0).toISOString(),
        new Date().toISOString(),
        null,
        null,
      ]);

      const stats = result.rows[0];
      expect(stats.totalTraces).toBeGreaterThanOrEqual(2);
      expect(stats.errorCount).toBe(1);
      expect(typeof stats.avgDurationMs).toBe("number");
      expect(typeof stats.totalCost).toBe("number");
    });
  });

  describe("nullable filter pattern", () => {
    it("NULL param passes through filter (returns all)", async () => {
      const sql = "SELECT * FROM users WHERE ($1::varchar IS NULL OR name = $1);";
      const result = await client.query(sql, [null]);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("non-NULL param filters correctly", async () => {
      const sql = "SELECT * FROM users WHERE ($1::varchar IS NULL OR name = $1);";
      const result = await client.query(sql, ["Alice"]);
      expect(result.rows.every((r) => r.name === "Alice")).toBe(true);
    });
  });
});
