/**
 * StreamCache — in-memory TTL cache for stream results.
 *
 * Features:
 * - TTL per entry (configurable, in seconds)
 * - Max-entry limit with FIFO eviction of the oldest entries
 * - Disabled mode when ttlSeconds === 0 (bypass — always calls loader)
 * - Deterministic in tests via injected `now` clock function
 */

export interface StreamCacheOptions {
  /** TTL in seconds. 0 = cache disabled (bypass). Default: 300 */
  ttlSeconds?: number;
  /** Maximum number of cached entries. Default: 500 */
  maxEntries?: number;
  /** Clock function for deterministic testing. Default: Date.now */
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class StreamCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly enabled: boolean;

  constructor(options?: StreamCacheOptions) {
    const ttlSeconds = options?.ttlSeconds ?? 300;
    this.enabled = ttlSeconds > 0;
    this.ttlMs = ttlSeconds * 1000;
    this.maxEntries = options?.maxEntries ?? 500;
    this.now = options?.now ?? (() => Date.now());
  }

  /**
   * Return cached value for `key` if still valid, otherwise call `loader`,
   * store the result, and return it.
   */
  async getOrSet(key: string, loader: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    if (!this.enabled) {
      return loader(signal);
    }

    const now = this.now();
    const entry = this.store.get(key);

    if (entry !== undefined && entry.expiresAt > now) {
      return entry.value;
    }

    const value = await loader(signal);
    this.set(key, value);
    return value;
  }

  /** Store a value with the configured TTL. Evicts oldest entries if over maxEntries. */
  private set(key: string, value: T): void {
    // Delete and re-insert to move to end (refresh position for eviction)
    this.store.delete(key);

    // Evict oldest entries if at capacity
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }

    this.store.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  /** Current number of entries in the cache (including expired ones not yet cleaned up). */
  get size(): number {
    return this.store.size;
  }

  /** Whether the cache is enabled (TTL > 0). */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Invalidate a single entry by key. */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
  }
}
