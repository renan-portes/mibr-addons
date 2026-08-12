import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getPort, loadEnvFile } from "../src/utils/env.js";

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

describe("loadEnvFile", () => {
  it("loads variables from local .env file without overwriting existing environment variables", () => {
    const dir = mkdtempSync(join(tmpdir(), "mibr-env-test-"));
    const envPath = join(dir, ".env");
    writeFileSync(envPath, 'TEST_ENV_VAR_LOADER="hello_world"\n# Comment line\nANOTHER_VAR=123\n');

    delete process.env.TEST_ENV_VAR_LOADER;
    delete process.env.ANOTHER_VAR;

    try {
      loadEnvFile(envPath);
      assert.equal(process.env.TEST_ENV_VAR_LOADER, "hello_world");
      assert.equal(process.env.ANOTHER_VAR, "123");
    } finally {
      delete process.env.TEST_ENV_VAR_LOADER;
      delete process.env.ANOTHER_VAR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
