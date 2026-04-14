"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFocusTime } from "./FocusTracker";

interface User {
  id: number;
  nickname: string;
  role: string;
  plan?: string;
  planExpireAt?: string | null;
  isPaid?: boolean;
  daysLeft?: number | null;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { focusSeconds, distractSeconds } = useFocusTime();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return;
    const localUser: User = JSON.parse(stored);
    setUser(localUser);

    // 从服务端同步最新订阅状态
    const token = localStorage.getItem("token");
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            const updated = { ...localUser, ...data.user };
            localStorage.setItem("user", JSON.stringify(updated));
            setUser(updated);
          }
        })
        .catch(() => {});
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/");
  }

  const distractWarning = distractSeconds >= 120;

  // 订阅状态展示
  function renderSubscriptionBadge() {
    if (!user) return null;
    if (user.role === "admin") return null; // 管理员不展示

    // 从 user 缓存读取（me 接口会同步）
    const isPaid = user.isPaid ?? false;
    const daysLeft = user.daysLeft ?? null;

    if (!isPaid) {
      return (
        <button
          onClick={() => router.push("/payment")}
          className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          开通会员
        </button>
      );
    }

    if (daysLeft !== null && daysLeft <= 3) {
      return (
        <button
          onClick={() => router.push("/payment")}
          className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
        >
          到期剩 {daysLeft} 天，续费
        </button>
      );
    }

    if (daysLeft !== null && daysLeft <= 7) {
      return (
        <button
          onClick={() => router.push("/payment")}
          className="rounded-full bg-orange-400 px-3 py-1 text-xs font-medium text-white hover:bg-orange-500"
        >
          会员剩 {daysLeft} 天
        </button>
      );
    }

    if (daysLeft !== null) {
      return (
        <span className="text-xs text-gray-400">
          会员 {daysLeft} 天
        </span>
      );
    }

    return null;
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/problems" className="text-lg font-bold text-blue-600">
            GESP.AI
          </Link>
          <Link href="/problems" className="text-sm text-gray-600 hover:text-gray-900">
            题库
          </Link>
          <Link href="/wrongbook" className="text-sm text-gray-600 hover:text-gray-900">
            错题本
          </Link>
          <Link href="/exam" className="text-sm text-gray-600 hover:text-gray-900">
            模考
          </Link>
          <Link href="/settings/parent" className="text-sm text-gray-600 hover:text-gray-900">
            家长设置
          </Link>
          {user?.role === "admin" && (
            <>
              <Link href="/admin/problems" className="text-sm text-gray-600 hover:text-gray-900">
                题目管理
              </Link>
              <Link href="/admin/prompts" className="text-sm text-gray-600 hover:text-gray-900">
                提示词管理
              </Link>
              <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">
                用户管理
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-green-600">专注 {formatTime(focusSeconds)}</span>
                <span className={distractWarning ? "text-red-500 font-bold" : "text-gray-400"}>
                  分心 {formatTime(distractSeconds)}
                </span>
              </div>

              {renderSubscriptionBadge()}

              <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900">
                {user.nickname}
                {user.role === "admin" && (
                  <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                    管理员
                  </span>
                )}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                登出
              </button>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                注册
              </Link>
              <Link
                href="/"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                登录
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
