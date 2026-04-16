"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

const DEFAULT_THRESHOLD_MIN = 2;
const STORAGE_KEY = "focus_data";
const SAVE_INTERVAL = 5; // 每 5 秒存一次 localStorage
const SYNC_INTERVAL = 60; // 每 60 秒同步一次服务端
const SPLIT_SCREEN_RATIO = 0.75; // 窗口宽度 < 屏幕 75% 视为分屏

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
  const [hasToken, setHasToken] = useState(false);

  // 从 localStorage 恢复的历史累积值
  const baseFocusMs = useRef(0);
  const baseDistractMs = useRef(0);

  const startTime = useRef(Date.now());
  const distractStart = useRef<number | null>(null);
  const distractTotal = useRef(0); // 本次会话的分心累计
  const notifiedThreshold = useRef(0);
  const lastWidth = useRef(typeof window !== "undefined" ? window.innerWidth : 0);
  const thresholdMs = useRef(DEFAULT_THRESHOLD_MIN * 60 * 1000);
  const tickCount = useRef(0);
  const initialized = useRef(false);

  const getToken = useCallback(() => {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
  }, []);

  // 监听 token 变化（登录/登出）
  useEffect(() => {
    if (getToken()) setHasToken(true);
    function onStorage(e: StorageEvent) {
      if (e.key === "token") setHasToken(!!e.newValue);
    }
    const check = setInterval(() => {
      const t = !!getToken();
      setHasToken((prev) => prev !== t ? t : prev);
    }, 1000);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(check);
    };
  }, [getToken]);

  // 同步到服务端
  const syncToServer = useCallback((focusMs: number, distractMs: number) => {
    const token = getToken();
    if (!token) return;
    try {
      // 用 sendBeacon 保证页面关闭时也能发出（POST）
      // 但 sendBeacon 不支持自定义 header，所以正常情况用 fetch
      fetch("/api/focus/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: todayStr(), focusMs, distractMs }),
        keepalive: true, // 允许页面关闭后继续发送
      }).catch(() => {});
    } catch {}
  }, [getToken]);

  // 从服务端恢复数据（localStorage 被清空时）
  const restoreFromServer = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/focus/sync?date=${todayStr()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.focusMs > 0 || data.distractMs > 0) {
        baseFocusMs.current = data.focusMs;
        baseDistractMs.current = data.distractMs;
      }
    } catch {}
  }, [getToken]);

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

  // 分屏检测：窗口宽度 < 屏幕 75%（且页面可见且有焦点时才判断）
  const checkSplitScreen = useCallback(() => {
    if (typeof screen === "undefined") return;
    if (document.hidden || !document.hasFocus()) return;
    const screenW = screen.availWidth;
    const windowW = window.outerWidth;
    if (screenW > 0 && windowW < screenW * SPLIT_SCREEN_RATIO) {
      markDistracted();
    } else {
      markFocused();
    }
  }, [markDistracted, markFocused]);

  const tick = useCallback(() => {
    const now = Date.now();

    // 分屏检测（每秒检查一次）
    checkSplitScreen();

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

    // 分心累计每超过阈值通知一次（基于总计）
    if (totalDistractMs >= notifiedThreshold.current + thresholdMs.current) {
      notifiedThreshold.current += thresholdMs.current;
      sendNotify(totalFocusMs, totalDistractMs);
    }

    // 每 5 秒持久化到 localStorage
    tickCount.current++;
    if (tickCount.current % SAVE_INTERVAL === 0) {
      saveStored({
        date: todayStr(),
        focusMs: totalFocusMs,
        distractMs: totalDistractMs,
        notifiedThreshold: notifiedThreshold.current,
      });
    }

    // 每 60 秒同步到服务端
    if (tickCount.current % SYNC_INTERVAL === 0) {
      syncToServer(totalFocusMs, totalDistractMs);
    }
  }, [sendNotify, syncToServer, checkSplitScreen]);

  useEffect(() => {
    if (!hasToken) return;
    if (initialized.current) return;
    initialized.current = true;

    // 重置会话起点
    startTime.current = Date.now();
    distractTotal.current = 0;
    distractStart.current = null;

    // 恢复历史数据：先查 localStorage，没有则从服务端恢复
    const stored = loadStored();
    if (stored) {
      baseFocusMs.current = stored.focusMs;
      baseDistractMs.current = stored.distractMs;
      notifiedThreshold.current = stored.notifiedThreshold;
    } else {
      // localStorage 被清空或跨天，尝试从服务端恢复
      restoreFromServer();
    }

    // 从服务端获取家长设置的通知阈值
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user?.notifyThresholdMin) {
          thresholdMs.current = data.user.notifyThresholdMin * 60 * 1000;
        }
      })
      .catch(() => {});

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
      // resize 时不直接判断分心，交给每秒的 checkSplitScreen 统一处理
      // 全屏切换会触发 resize 且瞬间宽度变化大，直接判断会误报
      lastWidth.current = window.innerWidth;
    }

    // 页面关闭前保存 + 同步
    function handleBeforeUnload() {
      const now = Date.now();
      let sessionDistract = distractTotal.current;
      if (distractStart.current !== null) {
        sessionDistract += now - distractStart.current;
      }
      const sessionFocus = Math.max(0, (now - startTime.current) - sessionDistract);
      const totalFocusMs = baseFocusMs.current + sessionFocus;
      const totalDistractMs = baseDistractMs.current + sessionDistract;
      saveStored({
        date: todayStr(),
        focusMs: totalFocusMs,
        distractMs: totalDistractMs,
        notifiedThreshold: notifiedThreshold.current,
      });
      // 关闭前同步到服务端（keepalive 保证发送）
      syncToServer(totalFocusMs, totalDistractMs);
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
      handleBeforeUnload();
    };
  }, [hasToken, getToken, markDistracted, markFocused, tick, restoreFromServer, syncToServer]);

  return (
    <FocusContext.Provider value={time}>
      {children}
    </FocusContext.Provider>
  );
}
