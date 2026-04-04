import { describe, it, expect } from "vitest";
import { sqlTypeToJsonSchema, sqlTypeToTsType } from "../types";

describe("d1 sqlTypeToJsonSchema", () => {
  it("maps INTEGER to integer", () => {
    expect(sqlTypeToJsonSchema("INTEGER")).toEqual({ type: "integer" });
  });

  it("maps BIGINT to integer", () => {
    expect(sqlTypeToJsonSchema("BIGINT")).toEqual({ type: "integer" });
  });

  it("maps REAL to number", () => {
    expect(sqlTypeToJsonSchema("REAL")).toEqual({ type: "number" });
  });

  it("maps BOOLEAN to integer (SQLite stores 0/1)", () => {
    expect(sqlTypeToJsonSchema("BOOLEAN")).toEqual({ type: "integer" });
  });

  it("maps TEXT to string", () => {
    expect(sqlTypeToJsonSchema("TEXT")).toEqual({ type: "string" });
  });

  it("maps VARCHAR(255) to string with maxLength", () => {
    expect(sqlTypeToJsonSchema("VARCHAR(255)")).toEqual({ type: "string", maxLength: 255 });
  });

  it("maps BLOB to byte format", () => {
    expect(sqlTypeToJsonSchema("BLOB")).toEqual({ type: "string", format: "byte" });
  });

  it("maps DATETIME to date-time format", () => {
    expect(sqlTypeToJsonSchema("DATETIME")).toEqual({ type: "string", format: "date-time" });
  });

  it("maps DATE to date format", () => {
    expect(sqlTypeToJsonSchema("DATE")).toEqual({ type: "string", format: "date" });
  });

  it("defaults unknown types to string", () => {
    expect(sqlTypeToJsonSchema("CUSTOM_TYPE")).toEqual({ type: "string" });
  });
});

describe("d1 sqlTypeToTsType", () => {
  it("maps INTEGER to number", () => {
    expect(sqlTypeToTsType("INTEGER")).toBe("number");
  });

  it("maps REAL to number", () => {
    expect(sqlTypeToTsType("REAL")).toBe("number");
  });

  it("maps BOOLEAN to number", () => {
    expect(sqlTypeToTsType("BOOLEAN")).toBe("number");
  });

  it("maps TEXT to string", () => {
    expect(sqlTypeToTsType("TEXT")).toBe("string");
  });

  it("maps BLOB to ArrayBuffer", () => {
    expect(sqlTypeToTsType("BLOB")).toBe("ArrayBuffer");
  });

  it("maps DATETIME to string", () => {
    expect(sqlTypeToTsType("DATETIME")).toBe("string");
  });

  it("defaults unknown types to string", () => {
    expect(sqlTypeToTsType("WHATEVER")).toBe("string");
  });
});
