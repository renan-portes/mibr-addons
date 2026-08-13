import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StreamCache } from "../src/services/streamCache.js";

describe("StreamCache", () => {
  it("returns cached value on hit without calling loader again", async () => {
    let calls = 0;
    const cache = new StreamCache<string>({ ttlSeconds: 60 });

    const loader = async () => {
      calls++;
      return "result";
    };

    const first = await cache.getOrSet("key", loader, new AbortController().signal);
    const second = await cache.getOrSet("key", loader, new AbortController().signal);

    assert.equal(first, "result");
    assert.equal(second, "result");
    assert.equal(calls, 1);
  });

  it("calls loader on cache miss and stores the result", async () => {
    let calls = 0;
    const cache = new StreamCache<number>({ ttlSeconds: 60 });

    const loader = async () => {
      calls++;
      return 42;
    };

    const result = await cache.getOrSet("key", loader, new AbortController().signal);

    assert.equal(result, 42);
    assert.equal(calls, 1);
    assert.equal(cache.size, 1);
  });

  it("expires entries after TTL and calls loader again", async () => {
    let tick = 0;
    const now = () => tick;

    const cache = new StreamCache<string>({ ttlSeconds: 10, now });

    let calls = 0;
    const loader = async () => {
      calls++;
      return "value";
    };

    // First call — miss, stores entry expiring at tick=10000
    await cache.getOrSet("key", loader, new AbortController().signal);
    assert.equal(calls, 1);

    // Still within TTL — hit
    tick = 9_999;
    await cache.getOrSet("key", loader, new AbortController().signal);
    assert.equal(calls, 1);

    // TTL expired — miss again
    tick = 10_001;
    await cache.getOrSet("key", loader, new AbortController().signal);
    assert.equal(calls, 2);
  });

  it("evicts oldest entry when maxEntries is exceeded", async () => {
    const cache = new StreamCache<string>({ ttlSeconds: 60, maxEntries: 3 });

    await cache.getOrSet("a", async () => "A", new AbortController().signal);
    await cache.getOrSet("b", async () => "B", new AbortController().signal);
    await cache.getOrSet("c", async () => "C", new AbortController().signal);

    assert.equal(cache.size, 3);

    // Adding 4th entry should evict "a" (oldest)
    await cache.getOrSet("d", async () => "D", new AbortController().signal);

    assert.equal(cache.size, 3);

    // "a" was evicted — loader called again for it
    let called = false;
    await cache.getOrSet("a", async () => {
      called = true;
      return "A2";
    }, new AbortController().signal);

    assert.equal(called, true);
  });

  it("bypasses cache completely when TTL is 0 (disabled)", async () => {
    let calls = 0;
    const cache = new StreamCache<string>({ ttlSeconds: 0 });

    const loader = async () => {
      calls++;
      return "result";
    };

    await cache.getOrSet("key", loader, new AbortController().signal);
    await cache.getOrSet("key", loader, new AbortController().signal);

    assert.equal(calls, 2);
    assert.equal(cache.isEnabled, false);
    assert.equal(cache.size, 0);
  });

  it("isEnabled is true when TTL > 0", () => {
    const enabled = new StreamCache({ ttlSeconds: 60 });
    const disabled = new StreamCache({ ttlSeconds: 0 });

    assert.equal(enabled.isEnabled, true);
    assert.equal(disabled.isEnabled, false);
  });

  it("invalidates a single entry by key", async () => {
    let calls = 0;
    const cache = new StreamCache<string>({ ttlSeconds: 60 });
    const loader = async () => {
      calls++;
      return "val";
    };

    await cache.getOrSet("k1", loader, new AbortController().signal);
    await cache.getOrSet("k2", loader, new AbortController().signal);
    assert.equal(calls, 2);

    cache.invalidate("k1");

    // k1 was invalidated — loader called again
    await cache.getOrSet("k1", loader, new AbortController().signal);
    assert.equal(calls, 3);

    // k2 still cached — no extra call
    await cache.getOrSet("k2", loader, new AbortController().signal);
    assert.equal(calls, 3);
  });

  it("clears all entries", async () => {
    const cache = new StreamCache<string>({ ttlSeconds: 60 });

    await cache.getOrSet("a", async () => "A", new AbortController().signal);
    await cache.getOrSet("b", async () => "B", new AbortController().signal);

    assert.equal(cache.size, 2);
    cache.clear();
    assert.equal(cache.size, 0);
  });

  it("uses default TTL of 300 seconds when not specified", async () => {
    let tick = 0;
    const now = () => tick;
    const cache = new StreamCache<string>({ now });

    let calls = 0;
    await cache.getOrSet("key", async () => { calls++; return "v"; }, new AbortController().signal);

    // 299 seconds in — still cached
    tick = 299_000;
    await cache.getOrSet("key", async () => { calls++; return "v"; }, new AbortController().signal);
    assert.equal(calls, 1);

    // 300 seconds + 1ms — expired
    tick = 300_001;
    await cache.getOrSet("key", async () => { calls++; return "v"; }, new AbortController().signal);
    assert.equal(calls, 2);
  });

  it("propagates loader errors without caching the result", async () => {
    const cache = new StreamCache<string>({ ttlSeconds: 60 });

    let calls = 0;
    const loader = async () => {
      calls++;
      throw new Error("loader failure");
    };

    await assert.rejects(() => cache.getOrSet("key", loader, new AbortController().signal), /loader failure/);
    assert.equal(cache.size, 0);

    // Next call should try loader again (no poison entry)
    await assert.rejects(() => cache.getOrSet("key", loader, new AbortController().signal), /loader failure/);
    assert.equal(calls, 2);
  });

  it("does not return stale value when entry is exactly at expiry boundary", async () => {
    let tick = 0;
    const now = () => tick;
    const cache = new StreamCache<string>({ ttlSeconds: 10, now });

    let calls = 0;
    const loader = async () => { calls++; return "v"; };

    // Miss at tick=0, stores expiresAt=10000
    await cache.getOrSet("key", loader, new AbortController().signal);

    // At exactly expiry moment — should be expired (expiresAt > now is false)
    tick = 10_000;
    await cache.getOrSet("key", loader, new AbortController().signal);

    assert.equal(calls, 2);
  });
});
