"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ChatPanel from "@/components/ChatPanel";

interface WrongBookEntry {
  id: number;
  problemId: number;
  addedAt: string;
  mastered: boolean;
  problem: {
    id: number;
    luoguId: string;
    title: string;
    level: number;
  };
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

const ANALYSIS_TRIGGER = "请分析我的代码哪里出错了。";

export default function WrongBookPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WrongBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "mastered">("all");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [aiProblem, setAiProblem] = useState<{ id: number; title: string } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetch("/api/wrongbook", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRemove(problemId: number) {
    await fetch(`/api/wrongbook/${problemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setEntries((prev) => prev.filter((e) => e.problemId !== problemId));
  }

  const filtered = entries.filter((e) => {
    if (statusFilter === "pending" && e.mastered) return false;
    if (statusFilter === "mastered" && !e.mastered) return false;
    if (levelFilter !== null && e.problem.level !== levelFilter) return false;
    return true;
  });

  const masteredCount = entries.filter((e) => e.mastered).length;
  const pendingCount = entries.length - masteredCount;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">错题本</h1>

        {/* 统计栏 */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1 rounded-lg bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-gray-900">{entries.length}</div>
            <div className="text-sm text-gray-500 mt-1">共收录</div>
          </div>
          <div className="flex-1 rounded-lg bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-red-500">{pendingCount}</div>
            <div className="text-sm text-gray-500 mt-1">待解决</div>
          </div>
          <div className="flex-1 rounded-lg bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">{masteredCount}</div>
            <div className="text-sm text-gray-500 mt-1">已掌握</div>
          </div>
        </div>

        {/* 筛选：状态 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "pending", "mastered"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {s === "all" ? "全部" : s === "pending" ? "待解决" : "已掌握"}
            </button>
          ))}
          <div className="mx-2 border-l border-gray-200" />
          <button
            onClick={() => setLevelFilter(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              levelFilter === null
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            所有级别
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(levelFilter === l ? null : l)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                levelFilter === l
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l}级
            </button>
          ))}
        </div>

        {/* 错题列表 */}
        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            {entries.length === 0 ? "错题本还是空的，加油刷题！" : "没有符合条件的错题"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 rounded-lg bg-white px-5 py-4 shadow-sm"
              >
                {/* 掌握状态指示条 */}
                <div
                  className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    entry.mastered ? "bg-green-400" : "bg-red-400"
                  }`}
                />

                {/* 题目信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {entry.problem.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${
                        LEVEL_COLORS[entry.problem.level] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {entry.problem.level}级
                    </span>
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                      {entry.problem.luoguId}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span>
                      {new Date(entry.addedAt).toLocaleDateString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      加入
                    </span>
                    {entry.mastered ? (
                      <span className="font-medium text-green-600">已掌握</span>
                    ) : (
                      <span className="font-medium text-red-500">待解决</span>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/problems/${entry.problemId}`)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    去做题
                  </button>
                  <button
                    onClick={() =>
                      setAiProblem({ id: entry.problemId, title: entry.problem.title })
                    }
                    className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
                  >
                    错题分析
                  </button>
                  <button
                    onClick={() => handleRemove(entry.problemId)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-red-500"
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* AI 分析弹窗 */}
      {aiProblem && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-4">
          <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <span className="text-sm font-semibold text-gray-900">错题分析</span>
                <span className="ml-2 text-xs text-gray-400 truncate max-w-[200px] inline-block align-middle">
                  {aiProblem.title}
                </span>
              </div>
              <button
                onClick={() => setAiProblem(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* ChatPanel：错题分析模式 */}
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                problemId={aiProblem.id}
                code=""
                mode="analysis"
                title="错题分析"
                initialMessage={ANALYSIS_TRIGGER}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
