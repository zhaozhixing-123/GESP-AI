"use client";

/**
 * 前端埋点：向 /api/track 上报事件。
 *
 * 匿名 ID 存在 localStorage，用于串联同一浏览器登录前后的访问路径。
 * 上报采用 fire-and-forget + keepalive，不阻塞 UI，失败静默。
 */

const ANON_KEY = "gesp_anon_id";

export type EventType =
  | "page_view"
  | "problem_open"
  | "signup_submit"
  | "login_success"
  | "pay_success_client";

interface TrackPayload {
  path?: string;
  problemId?: number;
  metadata?: Record<string, unknown>;
}

function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export function trackEvent(type: EventType, payload: TrackPayload = {}): void {
  if (typeof window === "undefined") return;

  const anonymousId = getAnonId();
  const token = localStorage.getItem("token");

  const body = JSON.stringify({
    type,
    anonymousId,
    path: payload.path ?? window.location.pathname,
    problemId: payload.problemId,
    metadata: payload.metadata,
  });

  try {
    fetch("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => {
      // 埋点失败不影响用户流程
    });
  } catch {
    // 静默
  }
}
