"use client";

import { useEffect, useMemo, useState } from "react";
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
    tags: string; // JSON array
  };
  analysis: {
    content: string;
    errorType: string;
    submissionId: number;
  } | null;
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
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());

  // 分析文本：problemId -> 展示内容（去掉首行错误类型标签）
  const [analyses, setAnalyses] = useState<Record<number, string>>({});
  // 错误类型：problemId -> 类型字符串
  const [errorTypes, setErrorTypes] = useState<Record<number, string>>({});
  // 正在分析中的 problemId 集合
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  // 已展开分析面板的 problemId 集合
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  // 当前用户是否付费
  const [isPaid, setIsPaid] = useState(true); // 默认 true 避免闪烁

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const u = JSON.parse(stored);
      setIsPaid(u.isPaid ?? true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/wrongbook", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const loaded: WrongBookEntry[] = data.entries || [];
        setEntries(loaded);

        // 从服务端数据初始化分析状态（替代 localStorage）
        const initAnalyses: Record<number, string> = {};
        const initErrorTypes: Record<number, string> = {};
        for (const entry of loaded) {
          if (entry.analysis) {
            initErrorTypes[entry.problemId] = entry.analysis.errorType;
            initAnalyses[entry.problemId] = entry.analysis.content
              .replace(/【错误类型：.+?】\n?/, "")
              .trimStart();
          }
        }
        setAnalyses(initAnalyses);
        setErrorTypes(initErrorTypes);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── 衍生数据 ──────────────────────────────────────────────────

  /** 待解决题目中各知识点的出现频次，依次排序 */
  const weakPoints = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const e of entries) {
      if (e.mastered) continue;
      const tags: string[] = JSON.parse(e.problem.tags || "[]");
      for (const tag of tags) countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
    }
    return [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [entries]);

  /** 全部题目中涉及的唯一知识点标签 */
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const e of entries) {
      JSON.parse(e.problem.tags || "[]").forEach((t: string) => tagSet.add(t));
    }
    return [...tagSet].sort();
  }, [entries]);

  /** 已分析题目中各错误类型的出现频次 */
  const errorTypeTrend = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const errType of Object.values(errorTypes)) {
      countMap.set(errType, (countMap.get(errType) ?? 0) + 1);
    }
    return [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [errorTypes]);

  // ── 过滤 ──────────────────────────────────────────────────────

  function toggleTagFilter(tag: string) {
    setTagFilters((prev) => {
      const n = new Set(prev);
      n.has(tag) ? n.delete(tag) : n.add(tag);
      return n;
    });
  }

  const filtered = entries.filter((e) => {
    if (statusFilter === "pending" && e.mastered) return false;
    if (statusFilter === "mastered" && !e.mastered) return false;
    if (levelFilter !== null && e.problem.level !== levelFilter) return false;
    if (tagFilters.size > 0) {
      const entryTags: string[] = JSON.parse(e.problem.tags || "[]");
      if (!entryTags.some((t) => tagFilters.has(t))) return false;
    }
    return true;
  });

  const masteredCount = entries.filter((e) => e.mastered).length;
  const pendingCount = entries.length - masteredCount;

  // 免费用户已用分析次数（含加载的历史记录和本次新增）
  const freeLimitReached = !isPaid && Object.keys(analyses).length >= 1;

  // ── 操作 ──────────────────────────────────────────────────────

  async function handleRemove(problemId: number) {
    await fetch(`/api/wrongbook/${problemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setEntries((prev) => prev.filter((e) => e.problemId !== problemId));
    setAnalyses((prev) => { const n = { ...prev }; delete n[problemId]; return n; });
    setErrorTypes((prev) => { const n = { ...prev }; delete n[problemId]; return n; });
    setExpandedIds((prev) => { const n = new Set(prev); n.delete(problemId); return n; });
  }

  async function handleAnalyze(problemId: number) {
    if (analyzingIds.has(problemId)) return;

    setAnalyzingIds((prev) => new Set(prev).add(problemId));
    setExpandedIds((prev) => new Set(prev).add(problemId));
    setAnalyses((prev) => ({ ...prev, [problemId]: "" }));
    setErrorTypes((prev) => { const n = { ...prev }; delete n[problemId]; return n; });

    try {
      const res = await fetch("/api/wrongbook/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ problemId }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "analyze_limit") {
          setIsPaid(false); // 刷新限制状态，让按钮置灰
          setAnalyses((prev) => { const n = { ...prev }; delete n[problemId]; return n; });
        } else {
          setAnalyses((prev) => ({ ...prev, [problemId]: `**分析失败：** ${data.error}` }));
        }
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
                if (!typeExtracted) {
                  const match = fullText.match(/【错误类型：(.+?)】/);
                  if (match) {
                    typeExtracted = true;
                    setErrorTypes((prev) => ({ ...prev, [problemId]: match[1].trim() }));
                  }
                }
                const display = fullText.replace(/【错误类型：.+?】\n?/, "").trimStart();
                setAnalyses((prev) => ({ ...prev, [problemId]: display }));
              }
            } catch {}
          }
        }
      }
    } catch {
      setAnalyses((prev) => ({ ...prev, [problemId]: "**网络错误，请重试**" }));
    }

    setAnalyzingIds((prev) => { const n = new Set(prev); n.delete(problemId); return n; });
  }

  function toggleExpand(problemId: number) {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(problemId) ? n.delete(problemId) : n.add(problemId);
      return n;
    });
  }

  // ── 渲染 ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">错题本</h1>

        {/* 统计栏 */}
        <div className="mb-3 flex gap-4">
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

        {/* 错误类型趋势 */}
        {errorTypeTrend.length > 0 && (
          <div className="mb-3 rounded-lg bg-white px-4 py-3 shadow-sm flex items-center flex-wrap gap-x-1 gap-y-1">
            <span className="text-sm text-gray-400 mr-1">最常犯错误：</span>
            {errorTypeTrend.map(([type, count], i) => (
              <span key={type} className="text-sm">
                <span className="font-medium text-purple-700">{type}</span>
                <span className="text-gray-400"> ×{count}</span>
                {i < errorTypeTrend.length - 1 && (
                  <span className="text-gray-200 mx-1">·</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* 薄弱知识点 */}
        {weakPoints.length > 0 && (
          <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-2.5 text-sm font-semibold text-gray-500">
              薄弱知识点
              <span className="ml-1.5 text-xs font-normal text-gray-400">（基于 {pendingCount} 道待解决题目，点击可筛选）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {weakPoints.map(([tag, count]) => {
                const isSelected = tagFilters.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
                      isSelected
                        ? "bg-red-500 text-white ring-2 ring-red-300"
                        : "bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {tag}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                        isSelected ? "bg-red-400 text-white" : "bg-red-200 text-red-800"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 筛选 */}
        <div className="mb-4 space-y-2">
          {/* 第一行：状态 + 级别 */}
          <div className="flex flex-wrap gap-2">
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

          {/* 第二行：知识点标签 */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTagFilters(new Set())}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  tagFilters.size === 0
                    ? "bg-sky-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                全部标签
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    tagFilters.has(tag)
                      ? "bg-sky-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
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
              const hasCached = !!analyses[entry.problemId];

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
                        {/* 知识点标签 */}
                        {JSON.parse(entry.problem.tags || "[]").map((tag: string) => (
                          <button
                            key={tag}
                            onClick={() => toggleTagFilter(tag)}
                            className={`rounded-full px-2 py-0.5 text-xs flex-shrink-0 transition ${
                              tagFilters.has(tag)
                                ? "bg-sky-500 text-white"
                                : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
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
                      ) : freeLimitReached ? (
                        <button
                          disabled
                          title="订阅后解锁更多分析"
                          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
                          onClick={() => router.push("/payment")}
                        >
                          订阅后分析
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
                        {!isAnalyzing && !freeLimitReached && (
                          <button
                            onClick={() => handleAnalyze(entry.problemId)}
                            className="text-xs text-purple-500 hover:text-purple-700 hover:underline"
                          >
                            重新分析
                          </button>
                        )}
                        {!isAnalyzing && freeLimitReached && (
                          <button
                            onClick={() => router.push("/payment")}
                            className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                          >
                            订阅解锁
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
