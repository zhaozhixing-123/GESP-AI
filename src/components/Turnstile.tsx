"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 10_000;

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script load error")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script load error"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type Status = "loading" | "ready" | "error";

interface Props {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onStatusChange?: (status: Status) => void;
  theme?: "light" | "dark" | "auto";
}

export default function Turnstile({ onVerify, onExpire, onStatusChange, theme = "auto" }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  function updateStatus(next: Status) {
    setStatus(next);
    onStatusChange?.(next);
  }

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    const el = ref.current;

    const timeout = window.setTimeout(() => {
      if (!cancelled && !widgetIdRef.current) {
        console.error("[Turnstile] 脚本加载超时");
        updateStatus("error");
      }
    }, SCRIPT_TIMEOUT_MS);

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        try {
          widgetIdRef.current = window.turnstile.render(el, {
            sitekey: siteKey,
            theme,
            callback: (token) => {
              updateStatus("ready");
              onVerify(token);
            },
            "error-callback": () => {
              console.error("[Turnstile] 小部件错误");
              updateStatus("error");
            },
            "expired-callback": () => {
              updateStatus("loading");
              onExpire?.();
            },
          });
        } catch (e) {
          console.error("[Turnstile] render 失败:", e);
          updateStatus("error");
        }
      })
      .catch((e) => {
        console.error("[Turnstile] 脚本加载失败:", e);
        if (!cancelled) updateStatus("error");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, theme]);

  if (!siteKey) return null;

  return (
    <div className="space-y-1">
      <div ref={ref} className="flex min-h-[65px] items-center justify-center" />
      {status === "error" && (
        <p className="text-center text-xs text-red-600">
          人机校验加载失败，请刷新页面重试（或检查网络是否能访问 Cloudflare）
        </p>
      )}
    </div>
  );
}
