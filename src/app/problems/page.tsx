"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  tags: string; // JSON array
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

export default function ProblemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const level = searchParams.get("level") || "";

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
                      key={p.id}
                      onClick={() => router.push(`/problems/${p.id}`)}
                      className="cursor-pointer border-b last:border-b-0 hover:bg-blue-50 transition"
                    >
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">
                        {p.luoguId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {p.title}
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
