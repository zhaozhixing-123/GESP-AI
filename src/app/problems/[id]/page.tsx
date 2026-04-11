"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CodeEditor, { DEFAULT_CODE } from "@/components/CodeEditor";
import ChatPanel from "@/components/ChatPanel";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  tags: string; // JSON array
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
}

interface Sample { input: string; output: string; }

interface JudgeResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  status: string;
  time: string | null;
  memory: number | null;
}

interface RunSampleResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  status: string;
  time: string | null;
  memory: number | null;
  error: string;
}

interface RunResult {
  mode: "samples" | "custom";
  // samples mode
  results?: RunSampleResult[];
  // custom mode
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  status?: string;
  statusId?: number;
  time?: string | null;
  memory?: number | null;
}

interface Submission {
  id: number;
  status: string;
  timeUsed: number | null;
  memoryUsed: number | null;
  createdAt: string;
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

const STATUS_COLORS: Record<string, string> = {
  AC: "text-green-600",
  WA: "text-red-600",
  TLE: "text-orange-600",
  CE: "text-yellow-600",
  RE: "text-purple-600",
  MLE: "text-orange-600",
};

const STATUS_TEXT: Record<string, string> = {
  AC: "AC 通过",
  WA: "WA 答案错误",
  TLE: "TLE 超时",
  CE: "CE 编译错误",
  RE: "RE 运行错误",
  MLE: "MLE 内存超限",
};

function MdContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:px-3 prose-th:py-1.5 prose-th:bg-gray-50 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-1.5">
      <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </Markdown>
    </div>
  );
}

export default function ProblemDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);

  // 提交判题状态
  const [submitting, setSubmitting] = useState(false);
  const [judgeResults, setJudgeResults] = useState<JudgeResult[] | null>(null);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submitError, setSubmitError] = useState("");

  // 错题本状态
  const [inWrongBook, setInWrongBook] = useState(false);
  const [wrongBookLoading, setWrongBookLoading] = useState(false);

  // 运行状态
  const [running, setRunning] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState("");
  const [activeTab, setActiveTab] = useState<"run" | "judge">("run");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    async function fetchProblem() {
      const res = await fetch(`/api/problems/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProblem(data);
        // 默认填充第一个样例输入
        const samples = JSON.parse(data.samples || "[]");
        if (samples.length > 0) setRunInput(samples[0].input);
      }
      setLoading(false);
    }
    fetchProblem();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/submissions?problemId=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setSubmissions(data.submissions || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/wrongbook/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setInWrongBook(data.inWrongBook ?? false))
      .catch(() => {});
  }, [id]);

  async function handleToggleWrongBook() {
    if (wrongBookLoading) return;
    setWrongBookLoading(true);
    try {
      if (inWrongBook) {
        await fetch(`/api/wrongbook/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setInWrongBook(false);
      } else {
        await fetch("/api/wrongbook", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ problemId: parseInt(id as string) }),
        });
        setInWrongBook(true);
      }
    } catch {}
    setWrongBookLoading(false);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleRunSamples() {
    if (!code.trim() || running) return;
    setRunning(true);
    setRunResult(null);
    setRunError("");
    setActiveTab("run");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ code, problemId: parseInt(id as string) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "运行失败");
      } else {
        setRunResult(data);
      }
    } catch {
      setRunError("运行失败，请检查网络");
    }
    setRunning(false);
  }

  async function handleRunCustom() {
    if (!code.trim() || running) return;
    setRunning(true);
    setRunResult(null);
    setRunError("");
    setActiveTab("run");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ code, stdin: runInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "运行失败");
      } else {
        setRunResult(data);
      }
    } catch {
      setRunError("运行失败，请检查网络");
    }
    setRunning(false);
  }

  async function handleSubmit() {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setJudgeResults(null);
    setOverallStatus(null);
    setSubmitError("");
    setActiveTab("judge");

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ problemId: parseInt(id as string), code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "提交失败");
      } else {
        setJudgeResults(data.results);
        setOverallStatus(data.submission.status);
        const historyRes = await fetch(`/api/submissions?problemId=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const historyData = await historyRes.json();
        setSubmissions(historyData.submissions || []);
      }
    } catch {
      setSubmitError("提交失败，请检查网络");
    }
    setSubmitting(false);
  }

  // 拖拽分隔线逻辑
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

  function startDrag() {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // 右面板底部标签页
  const [bottomTab, setBottomTab] = useState<"results" | "chat">("results");

  if (loading) {
    return (
      <div className="flex h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">题目不存在</div>
        </div>
      </div>
    );
  }

  const samples: Sample[] = JSON.parse(problem.samples || "[]");
  const busy = submitting || running;

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <Navbar />

      {/* 全屏分栏容器 */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* ===== 左面板：题目信息 ===== */}
        <div
          className="overflow-y-auto bg-white"
          style={{ width: `${leftWidth}%`, minWidth: 0 }}
        >
          <div className="space-y-4 p-5">
            {/* 返回 + 标题 */}
            <button
              onClick={() => router.back()}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; 返回题目列表
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{problem.title}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  LEVEL_COLORS[problem.level] || "bg-gray-100 text-gray-600"
                }`}
              >
                {problem.level}级
              </span>
              <span className="text-sm text-gray-400 font-mono">{problem.luoguId}</span>
              {JSON.parse(problem.tags || "[]").map((tag: string) => (
                <span key={tag} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                  {tag}
                </span>
              ))}
            </div>

            {/* 题目描述 */}
            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">题目描述</h2>
              <MdContent>{problem.description}</MdContent>
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">输入格式</h2>
              <MdContent>{problem.inputFormat}</MdContent>
            </section>

            <section>
              <h2 className="mb-2 text-base font-semibold text-gray-900">输出格式</h2>
              <MdContent>{problem.outputFormat}</MdContent>
            </section>

            {samples.map((sample, i) => (
              <section key={i}>
                <h2 className="mb-2 text-base font-semibold text-gray-900">
                  样例 {samples.length > 1 ? i + 1 : ""}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">输入</span>
                      <button
                        onClick={() => copyToClipboard(sample.input, `in-${i}`)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        {copied === `in-${i}` ? "已复制" : "复制"}
                      </button>
                    </div>
                    <pre className="rounded bg-gray-50 p-2.5 text-sm font-mono text-gray-800">
                      {sample.input}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">输出</span>
                      <button
                        onClick={() => copyToClipboard(sample.output, `out-${i}`)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        {copied === `out-${i}` ? "已复制" : "复制"}
                      </button>
                    </div>
                    <pre className="rounded bg-gray-50 p-2.5 text-sm font-mono text-gray-800">
                      {sample.output}
                    </pre>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* ===== 拖拽分隔线 ===== */}
        <div
          onMouseDown={startDrag}
          className="w-1.5 flex-shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
        />

        {/* ===== 右面板：编辑器 + 底部 ===== */}
        <div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>
          {/* 编辑器头部：按钮栏 */}
          <div className="flex items-center justify-between border-b bg-white px-4 py-2">
            <span className="text-sm font-medium text-gray-700">C++ 代码</span>
            <div className="flex gap-2">
              <button
                onClick={handleToggleWrongBook}
                disabled={wrongBookLoading}
                title={inWrongBook ? "从错题本移除" : "加入错题本"}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                  inWrongBook
                    ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {inWrongBook ? "★ 错题本" : "☆ 错题本"}
              </button>
              <button
                onClick={handleRunSamples}
                disabled={busy}
                className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {running ? "运行中..." : "运行样例"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "判题中..." : "提交"}
              </button>
            </div>
          </div>

          {/* 编辑器（自适应填满） */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} height="100%" />
          </div>

          {/* 底部区域：结果 / AI老师 / 自定义输入 */}
          <div className="flex max-h-[40%] flex-col border-t bg-white">
            {/* 标签页切换 */}
            <div className="flex border-b text-sm">
              <button
                onClick={() => setBottomTab("results")}
                className={`px-4 py-2 font-medium ${
                  bottomTab === "results"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                运行 / 判题
              </button>
              <button
                onClick={() => setBottomTab("chat")}
                className={`px-4 py-2 font-medium ${
                  bottomTab === "chat"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                AI 老师
              </button>
            </div>

            {/* 标签页内容 */}
            <div className="flex-1 overflow-y-auto">
              {bottomTab === "results" && (
                <div className="space-y-3 p-4">
                  {/* 自定义运行 */}
                  <div>
                    <button
                      onClick={() => setShowCustomInput(!showCustomInput)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700"
                    >
                      <span>自定义输入运行</span>
                      <span className="text-xs text-gray-400">{showCustomInput ? "收起" : "展开"}</span>
                    </button>
                    {showCustomInput && (
                      <div className="mt-2">
                        <textarea
                          value={runInput}
                          onChange={(e) => setRunInput(e.target.value)}
                          className="w-full rounded border p-2 font-mono text-sm"
                          rows={3}
                          placeholder="输入测试数据..."
                        />
                        <button
                          onClick={handleRunCustom}
                          disabled={busy}
                          className="mt-1 rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {running ? "运行中..." : "运行自定义输入"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 错误提示 */}
                  {(submitError || runError) && (
                    <div className="rounded bg-red-50 p-3 text-sm text-red-600">
                      {submitError || runError}
                    </div>
                  )}

                  {/* 运行结果 */}
                  {runResult && (
                    <div className="space-y-2">
                      {runResult.mode === "samples" && runResult.results && (
                        <>
                          {(() => {
                            const allAC = runResult.results.every((r) => r.status === "AC");
                            return (
                              <div className="flex items-center gap-3">
                                <span className={`font-bold ${allAC ? "text-green-600" : "text-red-600"}`}>
                                  {allAC ? "样例全部通过" : "样例未通过"}
                                </span>
                                <span className="text-sm text-gray-400">
                                  {runResult.results.filter((r) => r.status === "AC").length}/{runResult.results.length} 通过
                                </span>
                              </div>
                            );
                          })()}
                          {runResult.results.map((r, i) => (
                            <div key={i} className="rounded border p-2">
                              <div className="mb-1 flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-500">样例 {i + 1}</span>
                                <span className={`text-sm font-bold ${STATUS_COLORS[r.status] || "text-gray-600"}`}>
                                  {STATUS_TEXT[r.status] || r.status}
                                </span>
                                {r.time && <span className="text-xs text-gray-400">{(parseFloat(r.time) * 1000).toFixed(0)}ms</span>}
                                {r.memory && <span className="text-xs text-gray-400">{r.memory}KB</span>}
                              </div>
                              {r.error && (
                                <pre className="mb-1 max-h-24 overflow-auto rounded bg-red-50 p-2 text-xs font-mono text-red-700">{r.error}</pre>
                              )}
                              {r.status !== "AC" && r.status !== "CE" && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <div className="mb-0.5 font-medium text-gray-500">期望输出</div>
                                    <pre className="rounded bg-gray-50 p-1.5 font-mono">{r.expectedOutput}</pre>
                                  </div>
                                  <div>
                                    <div className="mb-0.5 font-medium text-gray-500">实际输出</div>
                                    <pre className="rounded bg-gray-50 p-1.5 font-mono">{r.actualOutput || "(无输出)"}</pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}

                      {runResult.mode === "custom" && (
                        <>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${
                              runResult.statusId === 6 ? "text-yellow-600" :
                              (runResult.statusId! >= 7 && runResult.statusId! <= 14) ? "text-red-600" :
                              runResult.statusId === 5 ? "text-orange-600" : "text-blue-600"
                            }`}>
                              {runResult.status}
                            </span>
                            {runResult.time && <span className="text-xs text-gray-400">{(parseFloat(runResult.time) * 1000).toFixed(0)}ms</span>}
                            {runResult.memory && <span className="text-xs text-gray-400">{runResult.memory}KB</span>}
                          </div>
                          {runResult.compileOutput && (
                            <div>
                              <div className="mb-0.5 text-xs font-medium text-gray-500">编译信息</div>
                              <pre className="max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs font-mono text-red-700">{runResult.compileOutput}</pre>
                            </div>
                          )}
                          {runResult.stdout && (
                            <div>
                              <div className="mb-0.5 text-xs font-medium text-gray-500">标准输出</div>
                              <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-2 text-sm font-mono text-gray-800">{runResult.stdout}</pre>
                            </div>
                          )}
                          {runResult.stderr && (
                            <div>
                              <div className="mb-0.5 text-xs font-medium text-gray-500">标准错误</div>
                              <pre className="max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs font-mono text-red-700">{runResult.stderr}</pre>
                            </div>
                          )}
                          {!runResult.stdout && !runResult.stderr && !runResult.compileOutput && (
                            <div className="text-sm text-gray-400">（无输出）</div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* 判题结果 */}
                  {overallStatus && judgeResults && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${STATUS_COLORS[overallStatus] || "text-gray-600"}`}>
                          {STATUS_TEXT[overallStatus] || overallStatus}
                        </span>
                      </div>
                      {judgeResults.map((r, i) => (
                        <div key={i} className="rounded border p-2">
                          <div className="mb-1 flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-500">#{i + 1}</span>
                            <span className={`text-sm font-bold ${STATUS_COLORS[r.status] || "text-gray-600"}`}>
                              {STATUS_TEXT[r.status] || r.status}
                            </span>
                            {r.time && <span className="text-xs text-gray-400">{(parseFloat(r.time) * 1000).toFixed(0)}ms</span>}
                            {r.memory && <span className="text-xs text-gray-400">{r.memory}KB</span>}
                          </div>
                          {r.status !== "AC" && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <div className="mb-0.5 font-medium text-gray-500">期望输出</div>
                                <pre className="rounded bg-gray-50 p-1.5 font-mono">{r.expectedOutput}</pre>
                              </div>
                              <div>
                                <div className="mb-0.5 font-medium text-gray-500">实际输出</div>
                                <pre className="rounded bg-gray-50 p-1.5 font-mono">{r.actualOutput || "(无输出)"}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 提交记录 */}
                  {submissions.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-gray-900">提交记录</h3>
                      <div className="space-y-1">
                        {submissions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                            <span className={`font-bold ${STATUS_COLORS[s.status] || "text-gray-600"}`}>
                              {STATUS_TEXT[s.status] || s.status}
                            </span>
                            <div className="flex gap-3 text-xs text-gray-400">
                              {s.timeUsed != null && <span>{s.timeUsed}ms</span>}
                              {s.memoryUsed != null && <span>{s.memoryUsed}KB</span>}
                              <span>
                                {new Date(s.createdAt).toLocaleString("zh-CN", {
                                  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bottomTab === "chat" && (
                <ChatPanel problemId={parseInt(id as string)} code={code} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
