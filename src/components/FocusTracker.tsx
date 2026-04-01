"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

const NOTIFY_THRESHOLD = 2 * 60 * 1000; // 分心累计 2 分钟才通知

interface FocusTime {
  focusSeconds: number;
  distractSeconds: number;
}

const FocusContext = createContext<FocusTime>({ focusSeconds: 0, distractSeconds: 0 });

export function useFocusTime() {
  return useContext(FocusContext);
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [time, setTime] = useState<FocusTime>({ focusSeconds: 0, distractSeconds: 0 });

  const startTime = useRef(Date.now());
  const distractStart = useRef<number | null>(null);
  const distractTotal = useRef(0);
  const notifiedThreshold = useRef(0); // 已通知到的分心阈值（ms）
  const lastWidth = useRef(typeof window !== "undefined" ? window.innerWidth : 0);

  const getToken = useCallback(() => {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
  }, []);

  const sendNotify = useCallback(async (focusMs: number, distractMs: number) => {
    const token = getToken();
    if (!token) return;

    const focusMinutes = Math.max(0, Math.round(focusMs / 60000));
    const distractMinutes = Math.round(distractMs / 60000);

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

  // 每秒 tick：更新显示 + 检查是否需要通知
  const tick = useCallback(() => {
    const now = Date.now();
    let currentDistract = distractTotal.current;
    if (distractStart.current !== null) {
      currentDistract += now - distractStart.current;
    }
    const totalElapsed = now - startTime.current;
    const focusMs = Math.max(0, totalElapsed - currentDistract);

    setTime({
      focusSeconds: Math.floor(focusMs / 1000),
      distractSeconds: Math.floor(currentDistract / 1000),
    });

    // 分心累计每超过 2 分钟通知一次
    if (currentDistract >= notifiedThreshold.current + NOTIFY_THRESHOLD) {
      notifiedThreshold.current += NOTIFY_THRESHOLD;
      sendNotify(focusMs, currentDistract);
    }
  }, [sendNotify]);

  useEffect(() => {
    if (!getToken()) return;

    function handleVisibility() {
      if (document.hidden) markDistracted();
      else markFocused();
    }
    function handleBlur() { markDistracted(); }
    function handleFocus() { markFocused(); }

    // 防作弊
    function handleContextMenu(e: Event) { e.preventDefault(); }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F12") { e.preventDefault(); return; }
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) {
        e.preventDefault();
      }
    }
    function handleResize() {
      const currentWidth = window.innerWidth;
      if (currentWidth < lastWidth.current - 200) {
        markDistracted();
      }
      lastWidth.current = currentWidth;
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    const timer = setInterval(tick, 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      clearInterval(timer);
    };
  }, [getToken, markDistracted, markFocused, tick]);

  return (
    <FocusContext.Provider value={time}>
      {children}
    </FocusContext.Provider>
  );
}
