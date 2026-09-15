import { describe, it, expect } from "vitest";
import {
  listContentQuerySchema,
  searchQuerySchema,
  contentIdParamSchema,
} from "./content.validation";

describe("listContentQuerySchema", () => {
  it("applies default limit and offset", () => {
    const result = listContentQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("coerces numeric strings", () => {
    const result = listContentQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it("rejects an invalid type", () => {
    expect(() =>
      listContentQuerySchema.parse({ type: "audiobook" })
    ).toThrow();
  });

  it("rejects a limit above the max", () => {
    expect(() => listContentQuerySchema.parse({ limit: "1000" })).toThrow();
  });
});

describe("searchQuerySchema", () => {
  it("requires a non-empty q", () => {
    expect(() => searchQuerySchema.parse({ q: "" })).toThrow();
    expect(() => searchQuerySchema.parse({})).toThrow();
  });

  it("trims whitespace from q", () => {
    const result = searchQuerySchema.parse({ q: "  neon  " });
    expect(result.q).toBe("neon");
  });
});

describe("contentIdParamSchema", () => {
  it("accepts a valid uuid", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(contentIdParamSchema.parse({ id }).id).toBe(id);
  });

  it("rejects a non-uuid id", () => {
    expect(() => contentIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});
