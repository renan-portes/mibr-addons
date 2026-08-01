import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockProvider } from "../src/providers/mockProvider.js";
import { ProviderManager } from "../src/services/providerManager.js";
import type { StreamProvider, StreamQuery } from "../src/types/streamProvider.js";
import type { StreamResult } from "../src/types/streamResult.js";

class FailingProvider implements StreamProvider {
  readonly id = "failing";
  readonly name = "Failing Provider";

  async getStreams(_query: StreamQuery, _signal: AbortSignal): Promise<StreamResult[]> {
    throw new Error("provider failure");
  }
}

class ExtraProvider implements StreamProvider {
  readonly id = "extra";
  readonly name = "Extra Provider";

  async getStreams(query: StreamQuery, _signal: AbortSignal): Promise<StreamResult[]> {
    return [
      {
        name: this.name,
        title: `Extra (${query.type})`,
        url: `https://example.com/stream/${query.id}`,
      },
    ];
  }
}

describe("ProviderManager", () => {
  it("registers and retrieves providers", () => {
    const manager = new ProviderManager();
    const provider = new MockProvider();

    manager.register(provider);

    assert.equal(manager.get("mock"), provider);
    assert.deepEqual(
      manager.list().map((entry) => entry.id),
      ["mock"],
    );
  });

  it("rejects duplicate provider ids", () => {
    const manager = new ProviderManager();
    manager.register(new MockProvider());

    assert.throws(() => manager.register(new MockProvider()), /already registered/);
  });

  it("aggregates streams from all providers", async () => {
    const manager = new ProviderManager();
    manager.register(new MockProvider());
    manager.register(new ExtraProvider());

    const streams = await manager.getStreamsFromAll({
      type: "movie",
      id: "tt1234567",
    });

    assert.equal(streams.length, 3);
    assert.equal(streams[2]?.name, "Extra Provider");
  });

  it("isolates provider failures", async () => {
    const manager = new ProviderManager();
    manager.register(new FailingProvider());
    manager.register(new MockProvider());

    const streams = await manager.getStreamsFromAll({
      type: "movie",
      id: "tt1234567",
    });

    assert.equal(streams.length, 2);
    assert.equal(streams[0]?.name, "MIBR Addons");
  });

  it("times out a provider that never resolves without blocking others", async () => {
    const manager = new ProviderManager({ timeoutMs: 20 });
    let receivedSignal: AbortSignal | undefined;

    manager.register({
      id: "stuck",
      name: "Stuck Provider",
      async getStreams(_query, signal) {
        receivedSignal = signal;
        return new Promise<StreamResult[]>(() => undefined);
      },
    });
    manager.register(new MockProvider());

    const streams = await manager.getStreamsFromAll({ type: "movie", id: "tt1234567" });

    assert.equal(streams.length, 2);
    assert.equal(receivedSignal?.aborted, true);
  });

  it("rejects invalid timeout configuration", () => {
    assert.throws(() => new ProviderManager({ timeoutMs: 0 }), /Invalid provider timeout/);
    assert.throws(() => new ProviderManager({ timeoutMs: 1.5 }), /Invalid provider timeout/);
  });
});
