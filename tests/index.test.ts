import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { main } from "../src/index.js";

describe("index", () => {
  it("exports a callable main function", () => {
    assert.equal(typeof main, "function");
  });
});
