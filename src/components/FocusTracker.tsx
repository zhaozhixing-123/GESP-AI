"use client";

import { useEffect, useRef, useCallback } from "react";

const NOTIFY_INTERVAL = 2 * 60 * 1000; // 2 分钟

export default function FocusTracker() {
  const focusStart = useRef(Date.now());
  const distractStart = useRef<number | null>(null);
  const distractTotal = useRef(0);
  const lastNotifiedAt = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWidth = useRef(typeof window !== "undefined" ? window.innerWidth : 0);

  const getToken = useCallback(() => {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
  }, []);

  const sendNotify = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const focusMs = Date.now() - focusStart.current - distractTotal.current;
    const focusMinutes = Math.max(0, Math.round(focusMs / 60000));
    const distractMinutes = Math.round(distractTotal.current / 60000);

    try {
      await fetch("/api/focus/notify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ focusMinutes, distractMinutes }),
      });
    } catch {}
  }, [getToken]);

  const markDistracted = useCallback(() => {
    if (distractStart.current === null) {
      distractStart.current = Date.now();
    }
  }, []);

  const markFocused = useCallback(() => {
    if (distractStart.current !== null) {
      distractTotal.current += Date.now() - distractStart.current;
      distractStart.current = null;
    }
  }, []);

  // 每秒检查是否需要通知
  const tick = useCallback(() => {
    // 如果正在分心中，计算实时总分心时间
    let total = distractTotal.current;
    if (distractStart.current !== null) {
      total += Date.now() - distractStart.current;
    }

    // 每 2 分钟通知一次
    if (total - lastNotifiedAt.current >= NOTIFY_INTERVAL) {
      lastNotifiedAt.current = total;
      sendNotify();
    }
  }, [sendNotify]);

  useEffect(() => {
    // 未登录不激活
    if (!getToken()) return;

    // ===== 分心检测 =====
    function handleVisibility() {
      if (document.hidden) markDistracted();
      else markFocused();
    }

    function handleBlur() { markDistracted(); }
    function handleFocus() { markFocused(); }

    // ===== 防作弊 =====
    function handleContextMenu(e: Event) {
      e.preventDefault();
    }

    function handleKeyDown(e: KeyboardEvent) {
      // F12
      if (e.key === "F12") { e.preventDefault(); return; }
      // Ctrl+Shift+I/J/C
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) {
        e.preventDefault();
        return;
      }
    }

    function handleResize() {
      const currentWidth = window.innerWidth;
      if (currentWidth < lastWidth.current - 200) {
        markDistracted();
      }
      lastWidth.current = currentWidth;
    }

    // 绑定事件
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    // 启动定时器
    timerRef.current = setInterval(tick, 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [getToken, markDistracted, markFocused, tick]);

  return null; // 无 UI
}
