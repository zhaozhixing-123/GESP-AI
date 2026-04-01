"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

const NOTIFY_THRESHOLD = 2 * 60 * 1000; // 分心累计 2 分钟才通知
const STORAGE_KEY = "focus_data";
const SAVE_INTERVAL = 5; // 每 5 秒存一次 localStorage

interface FocusTime {
  focusSeconds: number;
  distractSeconds: number;
}

interface StoredData {
  date: string; // YYYY-MM-DD，跨天自动重置
  focusMs: number;
  distractMs: number;
  notifiedThreshold: number;
}

function todayStr() {
  return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
}

function loadStored(): StoredData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: StoredData = JSON.parse(raw);
    if (data.date !== todayStr()) return null; // 跨天重置
    return data;
  } catch {
    return null;
  }
}

function saveStored(data: StoredData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const FocusContext = createContext<FocusTime>({ focusSeconds: 0, distractSeconds: 0 });

export function useFocusTime() {
  return useContext(FocusContext);
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [time, setTime] = useState<FocusTime>({ focusSeconds: 0, distractSeconds: 0 });

  // 从 localStorage 恢复的历史累积值
  const baseFocusMs = useRef(0);
  const baseDistractMs = useRef(0);

  const startTime = useRef(Date.now());
  const distractStart = useRef<number | null>(null);
  const distractTotal = useRef(0); // 本次会话的分心累计
  const notifiedThreshold = useRef(0);
  const lastWidth = useRef(typeof window !== "undefined" ? window.innerWidth : 0);
  const tickCount = useRef(0);
  const initialized = useRef(false);

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

  const tick = useCallback(() => {
    const now = Date.now();

    // 本次会话的分心时间
    let sessionDistract = distractTotal.current;
    if (distractStart.current !== null) {
      sessionDistract += now - distractStart.current;
    }
    // 本次会话的专注时间
    const sessionElapsed = now - startTime.current;
    const sessionFocus = Math.max(0, sessionElapsed - sessionDistract);

    // 总计 = 历史 + 本次会话
    const totalFocusMs = baseFocusMs.current + sessionFocus;
    const totalDistractMs = baseDistractMs.current + sessionDistract;

    setTime({
      focusSeconds: Math.floor(totalFocusMs / 1000),
      distractSeconds: Math.floor(totalDistractMs / 1000),
    });

    // 分心累计每超过 2 分钟通知一次（基于总计）
    if (totalDistractMs >= notifiedThreshold.current + NOTIFY_THRESHOLD) {
      notifiedThreshold.current += NOTIFY_THRESHOLD;
      sendNotify(totalFocusMs, totalDistractMs);
    }

    // 每 5 秒持久化一次
    tickCount.current++;
    if (tickCount.current % SAVE_INTERVAL === 0) {
      saveStored({
        date: todayStr(),
        focusMs: totalFocusMs,
        distractMs: totalDistractMs,
        notifiedThreshold: notifiedThreshold.current,
      });
    }
  }, [sendNotify]);

  useEffect(() => {
    if (!getToken()) return;
    if (initialized.current) return;
    initialized.current = true;

    // 恢复历史数据
    const stored = loadStored();
    if (stored) {
      baseFocusMs.current = stored.focusMs;
      baseDistractMs.current = stored.distractMs;
      notifiedThreshold.current = stored.notifiedThreshold;
    }

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

    // 页面关闭前保存
    function handleBeforeUnload() {
      const now = Date.now();
      let sessionDistract = distractTotal.current;
      if (distractStart.current !== null) {
        sessionDistract += now - distractStart.current;
      }
      const sessionFocus = Math.max(0, (now - startTime.current) - sessionDistract);
      saveStored({
        date: todayStr(),
        focusMs: baseFocusMs.current + sessionFocus,
        distractMs: baseDistractMs.current + sessionDistract,
        notifiedThreshold: notifiedThreshold.current,
      });
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("beforeunload", handleBeforeUnload);

    const timer = setInterval(tick, 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(timer);
      handleBeforeUnload(); // 组件卸载时也保存
    };
  }, [getToken, markDistracted, markFocused, tick]);

  return (
    <FocusContext.Provider value={time}>
      {children}
    </FocusContext.Provider>
  );
}
