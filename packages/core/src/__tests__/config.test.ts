import { describe, it, expect } from "vitest";
import { parseConfig } from "../config";

describe("parseConfig", () => {
  describe("valid configs", () => {
    it("parses a full config", () => {
      const result = parseConfig({
        dialect: "pg",
        queries: "./queries",
        migrations: "./migrations",
        schema: "./schema",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        dialect: "pg",
        queries: "./queries",
        migrations: "./migrations",
        schema: "./schema",
      });
    });

    it("applies defaults when paths are omitted", () => {
      const result = parseConfig({ dialect: "pg" });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        dialect: "pg",
        queries: "./queries",
        migrations: "./migrations",
        schema: "./schema",
      });
    });

    it("allows partial path overrides", () => {
      const result = parseConfig({
        dialect: "pg",
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
        dialect: "pg",
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

    it("rejects unsupported dialect", () => {
      const result = parseConfig({ dialect: "mysql" });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("dialect");
    });
  });

  describe("invalid paths", () => {
    it("rejects a random string without ./ or ../ prefix", () => {
      const result = parseConfig({
        dialect: "pg",
        queries: "random string",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("queries");
    });

    it("rejects an absolute path", () => {
      const result = parseConfig({
        dialect: "pg",
        queries: "/usr/local/queries",
      });

      expect(result.isErr()).toBe(true);
    });

    it("rejects an empty string", () => {
      const result = parseConfig({
        dialect: "pg",
        migrations: "",
      });

      expect(result.isErr()).toBe(true);
    });

    it("rejects paths with invalid characters", () => {
      const result = parseConfig({
        dialect: "pg",
        queries: './<script>alert("xss")</script>',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("invalid characters");
    });

    it("rejects paths with null bytes", () => {
      const result = parseConfig({
        dialect: "pg",
        queries: "./queries\0evil",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("null bytes");
    });

    it("rejects paths exceeding max length", () => {
      const result = parseConfig({
        dialect: "pg",
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
