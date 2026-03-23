"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CodeEditor, { DEFAULT_CODE } from "@/components/CodeEditor";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
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
  AC: "通过",
  WA: "答案错误",
  TLE: "超时",
  CE: "编译错误",
  RE: "运行错误",
  MLE: "内存超限",
};

function MdContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
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
  const [submitting, setSubmitting] = useState(false);
  const [judgeResults, setJudgeResults] = useState<JudgeResult[] | null>(null);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submitError, setSubmitError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    async function fetchProblem() {
      const res = await fetch(`/api/problems/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProblem(await res.json());
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

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleSubmit() {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setJudgeResults(null);
    setOverallStatus(null);
    setSubmitError("");

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
        // 刷新提交记录
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="text-gray-500">加载中...</div>
        </main>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="text-gray-500">题目不存在</div>
        </main>
      </div>
    );
  }

  const samples: Sample[] = JSON.parse(problem.samples || "[]");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          &larr; 返回题目列表
        </button>

        {/* 标题 */}
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{problem.title}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              LEVEL_COLORS[problem.level] || "bg-gray-100 text-gray-600"
            }`}
          >
            {problem.level}级
          </span>
          <span className="text-sm text-gray-400 font-mono">{problem.luoguId}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左侧：题目信息 */}
          <div className="space-y-6">
            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">题目描述</h2>
              <MdContent>{problem.description}</MdContent>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">输入格式</h2>
              <MdContent>{problem.inputFormat}</MdContent>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">输出格式</h2>
              <MdContent>{problem.outputFormat}</MdContent>
            </section>

            {samples.map((sample, i) => (
              <section key={i} className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">
                  样例 {samples.length > 1 ? i + 1 : ""}
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <pre className="rounded bg-gray-50 p-3 text-sm font-mono text-gray-800">
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
                    <pre className="rounded bg-gray-50 p-3 text-sm font-mono text-gray-800">
                      {sample.output}
                    </pre>
                  </div>
                </div>
              </section>
            ))}
          </div>

          {/* 右侧：代码编辑器 + 判题结果 + 提交记录 */}
          <div className="space-y-6">
            {/* 代码编辑器 */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium text-gray-700">C++ 代码</span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "判题中..." : "提交代码"}
                </button>
              </div>
              <CodeEditor value={code} onChange={setCode} height="400px" />
            </div>

            {/* 提交错误 */}
            {submitError && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
                {submitError}
              </div>
            )}

            {/* 判题结果 */}
            {overallStatus && judgeResults && (
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">判题结果</h2>
                  <span
                    className={`text-lg font-bold ${STATUS_COLORS[overallStatus] || "text-gray-600"}`}
                  >
                    {STATUS_TEXT[overallStatus] || overallStatus}
                  </span>
                </div>
                <div className="space-y-3">
                  {judgeResults.map((r, i) => (
                    <div key={i} className="rounded border p-3">
                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500">
                          测试点 {i + 1}
                        </span>
                        <span
                          className={`text-sm font-bold ${STATUS_COLORS[r.status] || "text-gray-600"}`}
                        >
                          {STATUS_TEXT[r.status] || r.status}
                        </span>
                        {r.time && (
                          <span className="text-xs text-gray-400">
                            {(parseFloat(r.time) * 1000).toFixed(0)}ms
                          </span>
                        )}
                        {r.memory && (
                          <span className="text-xs text-gray-400">
                            {r.memory}KB
                          </span>
                        )}
                      </div>
                      {r.status !== "AC" && (
                        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-medium text-gray-500">期望输出</div>
                            <pre className="rounded bg-gray-50 p-2 font-mono">{r.expectedOutput}</pre>
                          </div>
                          <div>
                            <div className="mb-1 font-medium text-gray-500">实际输出</div>
                            <pre className="rounded bg-gray-50 p-2 font-mono">{r.actualOutput || "(无输出)"}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 提交记录 */}
            {submissions.length > 0 && (
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">提交记录</h2>
                <div className="space-y-2">
                  {submissions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <span
                        className={`font-bold ${STATUS_COLORS[s.status] || "text-gray-600"}`}
                      >
                        {STATUS_TEXT[s.status] || s.status}
                      </span>
                      <div className="flex gap-3 text-xs text-gray-400">
                        {s.timeUsed != null && <span>{s.timeUsed}ms</span>}
                        {s.memoryUsed != null && <span>{s.memoryUsed}KB</span>}
                        <span>
                          {new Date(s.createdAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
