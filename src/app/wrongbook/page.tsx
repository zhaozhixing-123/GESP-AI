"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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

export default function WrongBookPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WrongBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "mastered">("all");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);

  // 分析文本：problemId -> 文本（当前会话内，展开时显示）
  const [analyses, setAnalyses] = useState<Record<number, string>>({});
  // 错误类型标签：problemId -> 类型字符串（持久化到 localStorage）
  const [errorTypes, setErrorTypes] = useState<Record<number, string>>({});
  // 正在分析中的 problemId 集合
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  // 已展开分析面板的 problemId 集合
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  function analysisKey(problemId: number) { return `wb_analysis_${problemId}`; }
  function errorTypeKey(problemId: number) { return `wb_errtype_${problemId}`; }

  useEffect(() => {
    fetch("/api/wrongbook", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const entries: WrongBookEntry[] = data.entries || [];
        setEntries(entries);
        // 只恢复错误类型标签（badge），不自动展开分析内容
        const types: Record<number, string> = {};
        for (const entry of entries) {
          const t = localStorage.getItem(errorTypeKey(entry.problemId));
          if (t) types[entry.problemId] = t;
        }
        setErrorTypes(types);
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
    setAnalyses((prev) => { const n = { ...prev }; delete n[problemId]; return n; });
    setErrorTypes((prev) => { const n = { ...prev }; delete n[problemId]; return n; });
    setExpandedIds((prev) => { const n = new Set(prev); n.delete(problemId); return n; });
    localStorage.removeItem(analysisKey(problemId));
    localStorage.removeItem(errorTypeKey(problemId));
  }

  async function handleAnalyze(problemId: number) {
    if (analyzingIds.has(problemId)) return;

    setAnalyzingIds((prev) => new Set(prev).add(problemId));
    setExpandedIds((prev) => new Set(prev).add(problemId));
    setAnalyses((prev) => ({ ...prev, [problemId]: "" }));
    localStorage.removeItem(analysisKey(problemId));
    localStorage.removeItem(errorTypeKey(problemId));

    try {
      const res = await fetch("/api/wrongbook/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ problemId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setAnalyses((prev) => ({ ...prev, [problemId]: `**分析失败：** ${data.error}` }));
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let typeExtracted = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                // 提取错误类型标签（流式，一旦出现即提取）
                if (!typeExtracted) {
                  const match = fullText.match(/【错误类型：(.+?)】/);
                  if (match) {
                    const errType = match[1].trim();
                    typeExtracted = true;
                    setErrorTypes((prev) => ({ ...prev, [problemId]: errType }));
                    localStorage.setItem(errorTypeKey(problemId), errType);
                  }
                }
                // 展示时去掉第一行标签
                const display = fullText.replace(/【错误类型：.+?】\n?/, "").trimStart();
                setAnalyses((prev) => ({ ...prev, [problemId]: display }));
              }
            } catch {}
          }
        }
      }

      if (fullText) localStorage.setItem(analysisKey(problemId), fullText);
    } catch {
      setAnalyses((prev) => ({ ...prev, [problemId]: "**网络错误，请重试**" }));
    }

    setAnalyzingIds((prev) => { const n = new Set(prev); n.delete(problemId); return n; });
  }

  function toggleExpand(problemId: number) {
    // 如果有缓存但内存里没有，先从 localStorage 恢复
    if (!expandedIds.has(problemId) && !analyses[problemId]) {
      const cached = localStorage.getItem(analysisKey(problemId));
      if (cached) {
        const display = cached.replace(/【错误类型：.+?】\n?/, "").trimStart();
        setAnalyses((prev) => ({ ...prev, [problemId]: display }));
      }
    }
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(problemId) ? n.delete(problemId) : n.add(problemId);
      return n;
    });
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

        {/* 筛选 */}
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
            {filtered.map((entry) => {
              const isAnalyzing = analyzingIds.has(entry.problemId);
              const analysisText = analyses[entry.problemId];
              const isExpanded = expandedIds.has(entry.problemId);
              const errorType = errorTypes[entry.problemId];
              const hasCached = !!localStorage.getItem(analysisKey(entry.problemId));

              return (
                <div key={entry.id} className="rounded-lg bg-white shadow-sm overflow-hidden">
                  {/* 错题行 */}
                  <div className="flex items-center gap-4 px-5 py-4">
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
                        {/* 错误类型标签 */}
                        {errorType && (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 flex-shrink-0">
                            {errorType}
                          </span>
                        )}
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
                      {/* 已有缓存：显示展开/收起；否则显示「错题分析」发起分析 */}
                      {hasCached || isAnalyzing ? (
                        <button
                          onClick={() => toggleExpand(entry.problemId)}
                          disabled={isAnalyzing && !analysisText}
                          className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                        >
                          {isAnalyzing
                            ? "分析中..."
                            : isExpanded
                            ? "收起分析"
                            : "查看分析"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAnalyze(entry.problemId)}
                          className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
                        >
                          错题分析
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(entry.problemId)}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-red-500"
                      >
                        移除
                      </button>
                    </div>
                  </div>

                  {/* 内联分析结果区（展开时显示） */}
                  {isExpanded && (
                    <div className="border-t border-purple-100 bg-purple-50 px-5 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-700 tracking-wide">
                          错题分析
                        </span>
                        {!isAnalyzing && (
                          <button
                            onClick={() => handleAnalyze(entry.problemId)}
                            className="text-xs text-purple-500 hover:text-purple-700 hover:underline"
                          >
                            重新分析
                          </button>
                        )}
                      </div>

                      {isAnalyzing && !analysisText ? (
                        <div className="text-sm text-purple-400">正在分析代码错误...</div>
                      ) : (
                        <>
                          <div className="prose prose-sm max-w-none text-gray-800 [&_:not(pre)>code]:bg-purple-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:text-purple-900 prose-pre:bg-gray-900 prose-pre:text-gray-100 [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100">
                            <Markdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {analysisText}
                            </Markdown>
                          </div>
                          {!isAnalyzing && (
                            <div className="mt-4 pt-3 border-t border-purple-200">
                              <button
                                onClick={() => router.push(`/problems/${entry.problemId}`)}
                                className="text-sm text-purple-700 font-medium hover:underline"
                              >
                                去题目页面继续和 AI 老师讨论 →
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
