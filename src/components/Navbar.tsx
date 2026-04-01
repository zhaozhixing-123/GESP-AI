"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: number;
  username: string;
  role: string;
}

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/");
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/problems" className="text-lg font-bold text-blue-600">
            GESP.AI
          </Link>
          <Link
            href="/problems"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            题库
          </Link>
          <Link
            href="/wrongbook"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            错题本
          </Link>
          <Link
            href="/settings/parent"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            家长设置
          </Link>
          {user?.role === "admin" && (
            <>
              <Link
                href="/admin/problems"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                题目管理
              </Link>
              <Link
                href="/admin/prompts"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                提示词管理
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <span className="text-sm text-gray-600">
                {user.username}
                {user.role === "admin" && (
                  <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                    管理员
                  </span>
                )}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                登出
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
