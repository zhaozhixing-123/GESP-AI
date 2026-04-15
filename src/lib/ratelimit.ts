/**
 * 基于内存的速率限制器（滑动窗口）
 * 适用于单实例部署；多实例部署需换用 Redis
 */

interface RateLimitEntry {
  timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// 惰性清理：记录上次清理时间，每 60s 在请求时顺便清理
// （比 setInterval 更适合 serverless 环境，冷启动后不会失效）
const CLEANUP_INTERVAL = 60_000;
const lastCleanup = new Map<string, number>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
    lastCleanup.set(name, Date.now());
  }

  // 惰性清理：距上次清理超过 60s 时执行
  const now = Date.now();
  if (now - (lastCleanup.get(name) || 0) > CLEANUP_INTERVAL) {
    lastCleanup.set(name, now);
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < 600_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
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

/**
 * 从 NextRequest 中提取客户端 IP
 * Railway 等反向代理会在 XFF 末尾追加真实 IP，
 * 从尾部往前跳过 TRUSTED_PROXY_HOPS 个代理 hop 取到客户端 IP
 */
const TRUSTED_HOPS = parseInt(process.env.TRUSTED_PROXY_HOPS || "1");

export function getClientIp(request: { headers: { get(name: string): string | null } }): string {
  const xff = request.headers.get("x-forwarded-for")?.split(",").map(s => s.trim()) || [];
  if (xff.length > 0) {
    const idx = Math.max(0, xff.length - 1 - TRUSTED_HOPS);
    return xff[idx];
  }
  return request.headers.get("x-real-ip") || "unknown";
}
