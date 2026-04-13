/**
 * 简单的内存 TTL 缓存 —— 用于避免每次 AI 调用都查库加载 prompt 模板
 * TTL 默认 5 分钟，与 Anthropic prompt cache 的 TTL 对齐
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private pending = new Map<string, Promise<T>>();

  constructor(private ttlMs: number = 5 * 60 * 1000) {}

  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    // 并发去重：同一个 key 的多个并发请求只触发一次 loader
    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const promise = loader()
      .then((value) => {
        this.cache.set(key, { value, expiresAt: now + this.ttlMs });
        this.pending.delete(key);
        return value;
      })
      .catch((err) => {
        this.pending.delete(key);
        throw err;
      });

    this.pending.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

/** 全局单例：用于缓存 DB 中的 prompt 模板 */
export const promptCache = new TtlCache<string>(5 * 60 * 1000);
