/**
 * 基于内存的速率限制器（滑动窗口）
 * 适用于单实例部署；多实例部署需换用 Redis
 */

interface RateLimitEntry {
  timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// 定期清理过期条目，防止内存泄漏
const CLEANUP_INTERVAL = 60_000; // 1 分钟
const cleanupTimers = new Map<string, ReturnType<typeof setInterval>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
    // 启动定期清理
    cleanupTimers.set(
      name,
      setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store!) {
          entry.timestamps = entry.timestamps.filter((t) => now - t < 600_000);
          if (entry.timestamps.length === 0) store!.delete(key);
        }
      }, CLEANUP_INTERVAL)
    );
  }
  return store;
}

export interface RateLimitConfig {
  /** 限制器名称（用于隔离不同业务的计数） */
  name: string;
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * 检查是否超出速率限制
 * @param key 限流键（通常是 IP 或 userId）
 */
export function checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult {
  const store = getStore(config.name);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // 清除窗口外的旧记录
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

/** 从 NextRequest 中提取客户端 IP */
export function getClientIp(request: { headers: { get(name: string): string | null } }): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
