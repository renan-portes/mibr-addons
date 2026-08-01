import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPort } from "../src/utils/env.js";

describe("getPort", () => {
  it("uses the default when PORT is missing", () => {
    assert.equal(getPort({}), 7000);
  });

  it("accepts integer ports in range", () => {
    assert.equal(getPort({ PORT: "1" }), 1);
    assert.equal(getPort({ PORT: "7000" }), 7000);
    assert.equal(getPort({ PORT: "65535" }), 65535);
  });

  it("rejects non-strict and out-of-range values", () => {
    for (const port of ["", "  ", "7000abc", "1.5", "0", "-1", "65536"]) {
      assert.throws(() => getPort({ PORT: port }), /Invalid PORT value/);
    }
  });
});
