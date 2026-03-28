import { describe, it, expect } from "vitest";
import { ok } from "neverthrow";
import { parseConfig } from "../config";
import type { Dialect } from "../dialect";

const mockDialect: Dialect = {
  name: "mock",
  parseSchema: () => ok({}),
  generateSQL: () => "",
};

describe("parseConfig", () => {
  describe("valid configs", () => {
    it("parses a full config", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "./queries",
        migrations: "./migrations",
        schema: "./schema",
      });

      expect(result.isOk()).toBe(true);
      const config = result._unsafeUnwrap();
      expect(config.dialect).toBe(mockDialect);
      expect(config.queries).toBe("./queries");
      expect(config.migrations).toBe("./migrations");
      expect(config.schema).toBe("./schema");
    });

    it("applies defaults when paths are omitted", () => {
      const result = parseConfig({ dialect: mockDialect });

      expect(result.isOk()).toBe(true);
      const config = result._unsafeUnwrap();
      expect(config.queries).toBe("./queries");
      expect(config.migrations).toBe("./migrations");
      expect(config.schema).toBe("./schema");
    });

    it("allows partial path overrides", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "./sql",
      });

      expect(result.isOk()).toBe(true);
      const config = result._unsafeUnwrap();
      expect(config.queries).toBe("./sql");
      expect(config.migrations).toBe("./migrations");
      expect(config.schema).toBe("./schema");
    });

    it("accepts paths starting with ../", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "../shared/queries",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().queries).toBe("../shared/queries");
    });
  });

  describe("invalid dialect", () => {
    it("rejects missing dialect", () => {
      const result = parseConfig({});
      expect(result.isErr()).toBe(true);
    });

    it("rejects a string dialect", () => {
      const result = parseConfig({ dialect: "pg" });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("dialect");
    });

    it("rejects an incomplete dialect object", () => {
      const result = parseConfig({ dialect: { name: "bad" } });
      expect(result.isErr()).toBe(true);
    });
  });

  describe("invalid paths", () => {
    it("rejects a random string without ./ or ../ prefix", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "random string",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("queries");
    });

    it("rejects an absolute path", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "/usr/local/queries",
      });

      expect(result.isErr()).toBe(true);
    });

    it("rejects an empty string", () => {
      const result = parseConfig({
        dialect: mockDialect,
        migrations: "",
      });

      expect(result.isErr()).toBe(true);
    });

    it("rejects paths with invalid characters", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: './<script>alert("xss")</script>',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("invalid characters");
    });

    it("rejects paths with null bytes", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "./queries\0evil",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("null bytes");
    });

    it("rejects paths exceeding max length", () => {
      const result = parseConfig({
        dialect: mockDialect,
        queries: "./" + "a".repeat(260),
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("maximum length");
    });
  });

  describe("non-object inputs", () => {
    it("rejects null", () => {
      expect(parseConfig(null).isErr()).toBe(true);
    });

    it("rejects undefined", () => {
      expect(parseConfig(undefined).isErr()).toBe(true);
    });

    it("rejects a string", () => {
      expect(parseConfig("pg").isErr()).toBe(true);
    });

    it("rejects a number", () => {
      expect(parseConfig(42).isErr()).toBe(true);
    });
  });
});
