"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  tags: string; // JSON array
  userStatus: "ac" | "attempted" | null;
  isVariant?: boolean;
  sourceId?: number;  // 仅变形题有
}

const LEVEL_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-700",
  2: "bg-green-100 text-green-700",
  3: "bg-blue-100 text-blue-700",
  4: "bg-blue-100 text-blue-700",
  5: "bg-orange-100 text-orange-700",
  6: "bg-orange-100 text-orange-700",
  7: "bg-red-100 text-red-700",
  8: "bg-red-100 text-red-700",
};

function ProblemsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);

  const level = searchParams.get("level") || "";
  const [defaultApplied, setDefaultApplied] = useState(false);

  // 首次加载：如果 URL 没有 level 参数，自动用用户的 targetLevel
  useEffect(() => {
    if (searchParams.has("level") || defaultApplied) return;
    const token = localStorage.getItem("token");
    if (!token) { setDefaultApplied(true); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user?.targetLevel) {
          router.replace(`/problems?level=${data.user.targetLevel}${searchParams.get("welcome") === "1" ? "&welcome=1" : ""}`);
        }
        setDefaultApplied(true);
      })
      .catch(() => setDefaultApplied(true));
  }, [searchParams, defaultApplied, router]);

  useEffect(() => {
    if (searchParams.get("welcome") === "1") setShowWelcome(true);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [level, debouncedSearch]);

  useEffect(() => {
    async function fetchProblems() {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (level) params.set("level", level);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", String(page));

      const res = await fetch(`/api/problems?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProblems(data.problems);
        setTotal(data.total);
        setPageSize(data.pageSize);
      }
      setLoading(false);
    }
    fetchProblems();
  }, [level, debouncedSearch, page]);

  const totalPages = Math.ceil(total / pageSize);

  function handleLevelFilter(l: string) {
    if (l) {
      router.push(`/problems?level=${l}`);
    } else {
      router.push("/problems");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {showWelcome && (
        <div className="border-b border-blue-200 bg-blue-50 px-4 py-4">
          <div className="mx-auto max-w-6xl flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-blue-900">欢迎来到 GESP.AI！</p>
              <p className="mt-0.5 text-sm text-blue-700">
                免费账号可以体验 <span className="font-semibold">1 道题</span>的全部功能——AI 老师对话（5 次）、提交判题。选一道你目标级别的题目开始吧。
              </p>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="flex-shrink-0 text-blue-400 hover:text-blue-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">题库</h1>
          <input
            type="text"
            placeholder="搜索题号或题目名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 级别筛选 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => handleLevelFilter("")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              !level
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            全部
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
            <button
              key={l}
              onClick={() => handleLevelFilter(String(l))}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                level === String(l)
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l}级
            </button>
          ))}
        </div>

        {/* 题目列表 */}
        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : problems.length === 0 ? (
          <div className="py-12 text-center text-gray-500">暂无题目</div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">
                  <th className="w-8 px-3 py-3"></th>
                  <th className="px-4 py-3 font-medium">编号</th>
                  <th className="px-4 py-3 font-medium">题目</th>
                  <th className="px-4 py-3 font-medium">知识点</th>
                  <th className="px-4 py-3 font-medium">级别</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => {
                  const tags: string[] = JSON.parse(p.tags || "[]");
                  return (
                    <tr
                      key={`${p.isVariant ? "v" : ""}${p.id}`}
                      onClick={() => router.push(`/problems/${p.isVariant ? `v${p.id}` : p.id}`)}
                      className={`cursor-pointer border-b last:border-b-0 transition ${
                        p.isVariant
                          ? "bg-amber-50/60 hover:bg-amber-100/80"
                          : "hover:bg-blue-50"
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        {p.userStatus === "ac" && (
                          <span title="已通过" className="text-green-500 text-base">✓</span>
                        )}
                        {p.userStatus === "attempted" && (
                          <span title="尝试过" className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">
                        {p.isVariant ? (
                          <span className="text-amber-600">↳ {p.luoguId}</span>
                        ) : (
                          <span className="text-gray-500">{p.luoguId}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {p.isVariant && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 shrink-0">
                              变形题
                            </span>
                          )}
                          {p.title}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
                            >
                              {tag}
                            </span>
                          ))}
                          {tags.length > 3 && (
                            <span className="text-xs text-gray-400">+{tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                            LEVEL_COLORS[p.level] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {p.level}级
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-white disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-white disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-gray-400">共 {total} 道题</p>
      </main>
    </div>
  );
}

export default function ProblemsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">加载中...</p>
        </div>
      }
    >
      <ProblemsContent />
    </Suspense>
  );
}
