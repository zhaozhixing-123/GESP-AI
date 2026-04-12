"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CodeEditor, { DEFAULT_CODE } from "@/components/CodeEditor";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type Phase = "config" | "exam" | "review";

interface ExamProblem {
  id: number;
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
  level: number;
  luoguId: string;
  tags: string;
}

interface SampleResult {
  passed: number;
  total: number;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "一级", 2: "二级", 3: "三级", 4: "四级",
  5: "五级", 6: "六级", 7: "七级", 8: "八级",
};

const COUNT_OPTIONS = [3, 5, 10];
const TIME_OPTIONS = [20, 40, 60];

function MdContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:px-3 prose-th:py-1.5 prose-th:bg-gray-50 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-1.5">
      <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </Markdown>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ExamPage() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // ── Config ─────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("config");
  const [level, setLevel] = useState(3);
  const [count, setCount] = useState(5);
  const [timeLimit, setTimeLimit] = useState(40); // minutes
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [configError, setConfigError] = useState("");

  // ── Exam ───────────────────────────────────────────
  const [problems, setProblems] = useState<ExamProblem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const codesRef = useRef<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const examStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // per-problem run results (during exam, optional)
  const [runResults, setRunResults] = useState<Record<number, { status: string; passed: number; total: number }>>({});
  const [runningId, setRunningId] = useState<number | null>(null);

  // ── Review ─────────────────────────────────────────
  const [sampleResults, setSampleResults] = useState<Record<number, SampleResult>>({});
  const [runningAllSamples, setRunningAllSamples] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  // ── Draggable split ────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(40);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.min(Math.max(pct, 20), 70));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Actions ────────────────────────────────────────

  async function startExam() {
    setConfigError("");
    setLoadingProblems(true);
    try {
      const res = await fetch(`/api/exam/problems?level=${level}&count=${count}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setConfigError(data.error || "获取题目失败");
        return;
      }
      const ps: ExamProblem[] = data.problems;
      setProblems(ps);
      const initCodes: Record<number, string> = {};
      ps.forEach((p) => { initCodes[p.id] = DEFAULT_CODE; });
      codesRef.current = initCodes;
      setCodes(initCodes);
      setCurrentIdx(0);

      const totalSeconds = timeLimit * 60;
      setTimeLeft(totalSeconds);
      examStartRef.current = Date.now();
      setPhase("exam");

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            endExam(ps, Date.now());
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setConfigError("网络错误，请重试");
    } finally {
      setLoadingProblems(false);
    }
  }

  function endExam(ps: ExamProblem[], endMs: number) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase("review");
    const usedMinutes = Math.max(1, Math.round((endMs - examStartRef.current) / 60000));
    runReview(ps, usedMinutes);
  }

  function handleEndExam() {
    endExam(problems, Date.now());
  }

  async function runReview(ps: ExamProblem[], usedMinutes: number) {
    // First batch-run all samples
    setRunningAllSamples(true);
    const results: Record<number, SampleResult> = {};

    for (const p of ps) {
      const code = codesRef.current[p.id] || "";
      if (!code?.trim() || code === DEFAULT_CODE) {
        results[p.id] = { passed: 0, total: 0 };
        continue;
      }
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ code, problemId: p.id }),
        });
        if (!res.ok) { results[p.id] = { passed: 0, total: 0 }; continue; }
        const data = await res.json();
        if (data.mode === "samples" && data.results) {
          const passed = data.results.filter((r: any) => r.status === "AC").length;
          results[p.id] = { passed, total: data.results.length };
        } else {
          results[p.id] = { passed: 0, total: 0 };
        }
      } catch {
        results[p.id] = { passed: 0, total: 0 };
      }
    }

    setSampleResults(results);
    setRunningAllSamples(false);

    // Then stream AI review
    setReviewing(true);
    const entries = ps.map((p) => ({
      title: p.title,
      description: p.description,
      code: codesRef.current[p.id] || "",
      samplesPassed: results[p.id]?.passed ?? 0,
      samplesTotal: results[p.id]?.total ?? 0,
    }));

    try {
      const res = await fetch("/api/exam/review", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ problems: entries, timeUsedMinutes: usedMinutes }),
      });
      if (!res.ok) {
        setReviewText("生成诊断报告失败，请刷新重试。");
        setReviewing(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.text) { full += d.text; setReviewText(full); }
              if (d.done) setReviewDone(true);
              if (d.error) { full += `\n\n[错误: ${d.error}]`; setReviewText(full); }
            } catch {}
          }
        }
      }
    } catch {
      setReviewText("网络错误，无法生成诊断报告。");
    }
    setReviewing(false);
  }

  async function handleRunSamples(problemId: number) {
    const code = codes[problemId];
    if (!code?.trim() || runningId !== null) return;
    setRunningId(problemId);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code, problemId }),
      });
      const data = await res.json();
      if (res.ok && data.mode === "samples" && data.results) {
        const passed = data.results.filter((r: any) => r.status === "AC").length;
        setRunResults((prev) => ({
          ...prev,
          [problemId]: {
            status: passed === data.results.length ? "AC" : "WA",
            passed,
            total: data.results.length,
          },
        }));
      }
    } catch {}
    setRunningId(null);
  }

  const currentProblem = problems[currentIdx];

  // ── Render ─────────────────────────────────────────

  if (phase === "config") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-xl px-4 py-12">
          <h1 className="mb-1 text-center text-2xl font-bold text-gray-900">模拟考试</h1>
          <p className="mb-8 text-center text-sm text-gray-500">仿 GESP 考试环境，限时作答，AI 生成诊断报告</p>

          <div className="rounded-xl bg-white p-6 shadow-sm space-y-6">
            {/* 级别 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">考试级别</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`rounded-lg border py-2 text-sm font-medium transition ${
                      level === l
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {LEVEL_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            {/* 题数 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">题目数量</label>
              <div className="flex gap-3">
                {COUNT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCount(c)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                      count === c
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {c} 道
                  </button>
                ))}
              </div>
            </div>

            {/* 时限 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">时间限制</label>
              <div className="flex gap-3">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeLimit(t)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                      timeLimit === t
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {t} 分钟
                  </button>
                ))}
              </div>
            </div>

            {configError && <p className="text-sm text-red-500">{configError}</p>}

            <button
              onClick={startExam}
              disabled={loadingProblems}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingProblems ? "加载题目中..." : "开始考试"}
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 space-y-1">
            <div className="font-medium">考试须知</div>
            <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
              <li>考试期间无 AI 辅助，请独立作答</li>
              <li>可随时运行样例自测，但运行不计入最终判题</li>
              <li>时间到或手动结束后，AI 老师自动生成诊断报告</li>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  if (phase === "exam" && currentProblem) {
    const runResult = runResults[currentProblem.id];
    const samples: Array<{ input: string; output: string }> = JSON.parse(currentProblem.samples || "[]");

    return (
      <div className="flex h-screen flex-col bg-gray-100">
        <Navbar />

        {/* 考试顶栏 */}
        <div className="flex items-center justify-between border-b bg-white px-4 py-2">
          {/* 题目导航 */}
          <div className="flex items-center gap-1">
            {problems.map((p, i) => {
              const code = codes[p.id] || "";
              const hasCode = code.trim() && code !== DEFAULT_CODE;
              const result = runResults[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => setCurrentIdx(i)}
                  className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold transition ${
                    i === currentIdx
                      ? "bg-blue-600 text-white"
                      : result?.status === "AC"
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : hasCode
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* 计时器 */}
          <span className={`font-mono text-lg font-bold ${timeLeft <= 60 ? "text-red-500" : timeLeft <= 300 ? "text-orange-500" : "text-gray-700"}`}>
            {formatTime(timeLeft)}
          </span>

          <button
            onClick={handleEndExam}
            className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            结束考试
          </button>
        </div>

        {/* 主体分栏 */}
        <div ref={containerRef} className="flex flex-1 overflow-hidden">
          {/* 左：题目 */}
          <div className="overflow-y-auto bg-white space-y-4 p-5" style={{ width: `${leftWidth}%`, minWidth: 0 }}>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{currentProblem.title}</h1>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {LEVEL_LABELS[currentProblem.level]}级
              </span>
            </div>
            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">题目描述</h2>
              <MdContent>{currentProblem.description}</MdContent>
            </section>
            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">输入格式</h2>
              <MdContent>{currentProblem.inputFormat}</MdContent>
            </section>
            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">输出格式</h2>
              <MdContent>{currentProblem.outputFormat}</MdContent>
            </section>
            {samples.map((s, i) => (
              <section key={i}>
                <h2 className="mb-2 text-base font-semibold text-gray-900">样例 {samples.length > 1 ? i + 1 : ""}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-500">输入</div>
                    <pre className="rounded bg-gray-50 p-2.5 text-sm font-mono text-gray-800">{s.input}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-500">输出</div>
                    <pre className="rounded bg-gray-50 p-2.5 text-sm font-mono text-gray-800">{s.output}</pre>
                  </div>
                </div>
              </section>
            ))}
          </div>

          {/* 拖拽分隔线 */}
          <div
            onMouseDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            className="w-1.5 flex-shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
          />

          {/* 右：编辑器 */}
          <div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>
            <div className="flex items-center justify-between border-b bg-white px-4 py-2">
              <span className="text-sm font-medium text-gray-700">
                第 {currentIdx + 1} 题 · C++ 代码
              </span>
              <div className="flex items-center gap-2">
                {runResult && (
                  <span className={`text-xs font-medium ${runResult.status === "AC" ? "text-green-600" : "text-orange-600"}`}>
                    样例 {runResult.passed}/{runResult.total}
                  </span>
                )}
                <button
                  onClick={() => handleRunSamples(currentProblem.id)}
                  disabled={runningId !== null}
                  className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  {runningId === currentProblem.id ? "运行中..." : "运行样例"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                value={codes[currentProblem.id] || DEFAULT_CODE}
                onChange={(v) => {
                codesRef.current = { ...codesRef.current, [currentProblem.id]: v };
                setCodes((prev) => ({ ...prev, [currentProblem.id]: v }));
              }}
                height="100%"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Review Phase ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">考试结束</h1>
          <p className="mt-1 text-sm text-gray-500">AI 正在为你生成诊断报告...</p>
        </div>

        {/* 各题样例结果 */}
        {!runningAllSamples && Object.keys(sampleResults).length > 0 && (
          <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">样例运行结果</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {problems.map((p, i) => {
                const r = sampleResults[p.id];
                const hasCode = (codes[p.id] || "").trim() && codes[p.id] !== DEFAULT_CODE;
                const allPassed = r && r.total > 0 && r.passed === r.total;
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-3 text-sm ${
                      !hasCode
                        ? "border-gray-200 bg-gray-50"
                        : allPassed
                        ? "border-green-200 bg-green-50"
                        : "border-orange-200 bg-orange-50"
                    }`}
                  >
                    <div className="font-medium text-gray-800 truncate">第 {i + 1} 题</div>
                    <div className={`mt-0.5 text-xs ${!hasCode ? "text-gray-400" : allPassed ? "text-green-700" : "text-orange-700"}`}>
                      {!hasCode ? "未作答" : r?.total ? `样例 ${r.passed}/${r.total}` : "运行失败"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {runningAllSamples && (
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm text-center text-sm text-gray-500">
            正在运行所有样例...
          </div>
        )}

        {/* AI 诊断报告 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">AI 诊断报告</h2>
          {!reviewText && !reviewing && !runningAllSamples && (
            <p className="text-sm text-gray-400">等待生成...</p>
          )}
          {(reviewing || reviewText) && (
            <div className="prose prose-sm max-w-none text-gray-700">
              <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {reviewText}
              </Markdown>
              {reviewing && !reviewDone && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-gray-500" />
              )}
            </div>
          )}
        </div>

        {reviewDone && (
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={() => router.push("/problems")}
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              去刷题
            </button>
            <button
              onClick={() => { setPhase("config"); setReviewText(""); setReviewDone(false); setSampleResults({}); setRunResults({}); }}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              再考一次
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
