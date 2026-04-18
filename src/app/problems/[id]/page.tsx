"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CodeEditor, { DEFAULT_CODE, defaultCodeForLevel } from "@/components/CodeEditor";
import ChatPanel from "@/components/ChatPanel";
import SubmissionDetailModal from "@/components/SubmissionDetailModal";
import SubmissionDiffModal from "@/components/SubmissionDiffModal";
import { STATUS_COLORS, STATUS_TEXT } from "@/lib/submission-status";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { trackEvent } from "@/lib/analytics";

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
  isVariant?: boolean;
  sourceLuoguId?: string; // 变形题：来源题编号
}

interface Sample { input: string; output: string; }

interface JudgeResult {
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  status: string;
  time: string | null;
  memory: number | null;
  isHidden: boolean;
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

/**
 * 字符级 diff：找最长公共前缀/后缀，中间是差异部分。
 * 对 GESP 输出（几十到几百字符）足够用，不依赖重型 diff 库。
 */
function splitCharDiff(e: string, a: string) {
  let p = 0;
  while (p < e.length && p < a.length && e[p] === a[p]) p++;
  let qe = e.length, qa = a.length;
  while (qe > p && qa > p && e[qe - 1] === a[qa - 1]) { qe--; qa--; }
  return {
    head: e.slice(0, p),
    eMid: e.slice(p, qe),
    aMid: a.slice(p, qa),
    tail: e.slice(qe),
  };
}

/** 期望/实际输出双栏 diff：行级对齐 + 差异行内字符级标注 */
function DiffPair({ expected, actual }: { expected: string; actual: string }) {
  const eLines = expected.split("\n");
  const aLines = actual.split("\n");
  const n = Math.max(eLines.length, aLines.length);
  const rows = Array.from({ length: n }, (_, i) => {
    const el = eLines[i] ?? "";
    const al = aLines[i] ?? "";
    return { e: el, a: al, same: el === al };
  });

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div>
        <div className="mb-0.5 font-medium text-gray-500">期望输出</div>
        <pre className="overflow-auto rounded bg-gray-50 p-1.5 font-mono leading-5">
          {rows.map((r, i) => {
            if (r.same) return <div key={i}>{r.e || "\u00A0"}</div>;
            const d = splitCharDiff(r.e, r.a);
            return (
              <div key={i} className="-mx-1 rounded bg-emerald-100 px-1">
                {d.head}
                {d.eMid && <span className="bg-emerald-300 font-semibold">{d.eMid}</span>}
                {d.tail || (d.head || d.eMid ? "" : "\u00A0")}
              </div>
            );
          })}
        </pre>
      </div>
      <div>
        <div className="mb-0.5 font-medium text-gray-500">实际输出</div>
        <pre className="overflow-auto rounded bg-gray-50 p-1.5 font-mono leading-5">
          {rows.map((r, i) => {
            if (r.same) return <div key={i}>{r.a || "\u00A0"}</div>;
            const d = splitCharDiff(r.e, r.a);
            return (
              <div key={i} className="-mx-1 rounded bg-rose-100 px-1">
                {d.head}
                {d.aMid && <span className="bg-rose-300 font-semibold">{d.aMid}</span>}
                {d.tail || (d.head || d.aMid ? "" : "\u00A0")}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

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
  const [paywallError, setPaywallError] = useState("");  // 403 付费墙
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

  // 代码选中 & 外部触发聊天
  const [selectedCode, setSelectedCode] = useState("");
  const [chatTrigger, setChatTrigger] = useState<{ text: string; code?: string; nonce: number } | undefined>();

  // 查看历史提交
  const [viewingSubmissionId, setViewingSubmissionId] = useState<number | null>(null);
  // 对比两次提交（newId 为较新的一次，oldId 为较旧的一次）
  const [diffPair, setDiffPair] = useState<{ newId: number; oldId: number } | null>(null);

  // WA 后的 AI 错因分析（流式）
  const [errorAnalysis, setErrorAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // 变形题提示卡片
  interface VariantInfo {
    hasAny: boolean;
    totalVariants: number;
    unlockedVariants: Array<{ id: number; title: string; level: number; batch: number }>;
    isPaid: boolean;
  }
  const [variantInfo, setVariantInfo] = useState<VariantInfo | null>(null);

  // 知识点 tag 进度：用户在每个 tag 下的 AC/总题数
  const [tagStats, setTagStats] = useState<Record<string, { ac: number; total: number }>>({});

  // AC 后的下一题推荐
  interface RecommendResp {
    problem?: { id: number; luoguId: string; title: string; level: number; tags: string };
    upgrade?: number;
    reason: string;
  }
  const [recommend, setRecommend] = useState<RecommendResp | null>(null);

  function handleLoadSubmission(oldCode: string) {
    // 仅当编辑器里已经有非默认内容时才二次确认，避免误覆盖
    const current = code.trim();
    const levelDefault = defaultCodeForLevel(problem?.level).trim();
    const isDirty = current !== "" && current !== levelDefault;
    if (isDirty && !confirm("当前编辑器内容会被覆盖，确认载入？")) return;
    setCode(oldCode);
    setViewingSubmissionId(null);
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // id 以 "v" 开头表示变形题
  const isVariantPage = typeof id === "string" && id.startsWith("v");
  const numericId     = isVariantPage ? parseInt((id as string).slice(1)) : parseInt(id as string);

  useEffect(() => {
    async function fetchProblem() {
      const res = await fetch(`/api/problems/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push("/");
        setLoading(false);
        return;
      }
      if (res.status === 403) {
        const data = await res.json();
        setPaywallError(data.message || "请订阅后解锁");
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setProblem(data);
        const samples = JSON.parse(data.samples || "[]");
        if (samples.length > 0) setRunInput(samples[0].input);
        trackEvent("problem_open", {
          problemId: numericId,
          metadata: { isVariant: isVariantPage, level: data.level },
        });
      } else {
        setLoading(false);
      }
      setLoading(false);
    }
    fetchProblem();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const historyUrl = isVariantPage
      ? `/api/variants/${numericId}/submissions`
      : `/api/submissions?problemId=${numericId}`;
    fetch(historyUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setSubmissions(data.submissions || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const wbUrl = isVariantPage
      ? `/api/variants/${numericId}/wrongbook`
      : `/api/wrongbook/${numericId}`;
    fetch(wbUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setInWrongBook(data.inWrongBook ?? false))
      .catch(() => {});
  }, [id]);

  // 切题 / 拿到题目信息后，加载存档或按 level 回落到对应模板
  // 1~4 级 → 启蒙模板；5~8 级 → 竞赛模板（万能头 + 关同步）
  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const saved = localStorage.getItem(`gesp_code_${id}`);
    if (saved) {
      setCode(saved);
      return;
    }
    setCode(defaultCodeForLevel(problem?.level));
  }, [id, problem?.level]);

  // 编辑时防抖写回 localStorage；仍是该题默认模板就不写，避免污染
  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const key = `gesp_code_${id}`;
    const levelDefault = defaultCodeForLevel(problem?.level);
    const timer = setTimeout(() => {
      if (code && code !== levelDefault) {
        try {
          localStorage.setItem(key, code);
        } catch {
          // 配额超了就忽略，不阻断做题
        }
      } else {
        localStorage.removeItem(key);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [code, id, problem?.level]);

  async function handleToggleWrongBook() {
    if (wrongBookLoading) return;
    setWrongBookLoading(true);
    try {
      if (inWrongBook) {
        const url = isVariantPage ? `/api/variants/${numericId}/wrongbook` : `/api/wrongbook/${numericId}`;
        await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setInWrongBook(false);
      } else {
        if (isVariantPage) {
          await fetch(`/api/variants/${numericId}/wrongbook`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        } else {
          await fetch("/api/wrongbook", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ problemId: numericId }),
          });
        }
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
        body: JSON.stringify({ code, problemId: isVariantPage ? undefined : numericId, variantId: isVariantPage ? numericId : undefined }),
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
        body: JSON.stringify({ code, stdin: runInput, problemId: isVariantPage ? undefined : numericId, variantId: isVariantPage ? numericId : undefined }),
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
    setErrorAnalysis("");
    setAnalysisError("");
    setVariantInfo(null);
    setActiveTab("judge");

    try {
      const submitUrl = isVariantPage
        ? `/api/variants/${numericId}/submit`
        : "/api/submissions";
      const submitBody = isVariantPage
        ? { code }
        : { problemId: numericId, code };

      const res  = await fetch(submitUrl, { method: "POST", headers: authHeaders, body: JSON.stringify(submitBody) });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "提交失败");
      } else {
        setJudgeResults(data.results);
        setOverallStatus(data.submission.status);
        const historyUrl = isVariantPage
          ? `/api/variants/${numericId}/submissions`
          : `/api/submissions?problemId=${numericId}`;
        const historyRes  = await fetch(historyUrl, { headers: { Authorization: `Bearer ${token}` } });
        const historyData = await historyRes.json();
        setSubmissions(historyData.submissions || []);
      }
    } catch {
      setSubmitError("提交失败，请检查网络");
    }
    setSubmitting(false);
  }

  // 拉取该题 tag 进度（AC/总题数），用于标题栏 badge
  useEffect(() => {
    if (!problem) return;
    let tags: string[] = [];
    try { tags = JSON.parse(problem.tags || "[]"); } catch {}
    if (tags.length === 0) return;
    fetch(`/api/user/tag-stats?tags=${encodeURIComponent(tags.join(","))}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (data.stats) setTagStats(data.stats); })
      .catch(() => {});
  }, [problem?.id]);

  // Ctrl/Cmd+Enter 快速提交（LeetCode 风格）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!submitting && !running && code.trim()) handleSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, submitting, running]);

  // WA 后拉取该题的变形题解锁状态（仅源题页）
  useEffect(() => {
    if (isVariantPage) return;
    if (!overallStatus || overallStatus === "AC") return;
    fetch(`/api/variants?sourceId=${numericId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (!data.error) setVariantInfo(data); })
      .catch(() => {});
  }, [overallStatus, numericId, isVariantPage]);

  // AC 后拉取下一题推荐（仅源题页；变形题通过自己的 flow 处理）
  useEffect(() => {
    if (isVariantPage) return;
    if (overallStatus !== "AC") { setRecommend(null); return; }
    fetch(`/api/problems/recommend?afterId=${numericId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { if (!data.error) setRecommend(data); })
      .catch(() => {});
  }, [overallStatus, numericId, isVariantPage]);

  // 触发 AI 错因分析（SSE 流）
  async function handleGenerateAnalysis() {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError("");
    setErrorAnalysis("");
    try {
      const body = isVariantPage ? { variantId: numericId } : { problemId: numericId };
      const res = await fetch("/api/wrongbook/analyze", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAnalysisError(data.message || data.error || "分析失败，请重试");
        setAnalysisLoading(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setAnalysisError("无法读取响应流");
        setAnalysisLoading(false);
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.text) setErrorAnalysis((prev) => prev + payload.text);
            if (payload.error) setAnalysisError(payload.error);
          } catch {}
        }
      }
    } catch {
      setAnalysisError("分析失败，请检查网络");
    }
    setAnalysisLoading(false);
  }

  // 对某个样例点问 AI（仅非隐藏、非 AC、非 CE 用）
  function askAIAboutCase(r: JudgeResult) {
    if (!problem) return;
    const prompt = `我在做《${problem.title}》时，这个样例过不了：
输入：
${r.input ?? ""}
期望输出：
${r.expectedOutput ?? ""}
我的输出：
${r.actualOutput || "(无输出)"}

请先不要直接改我的代码，引导我自己想想哪里可能出了问题。`;
    setChatTrigger({ text: prompt, code, nonce: Date.now() });
    setBottomTab("chat");
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
  const [bottomTab, setBottomTab] = useState<"results" | "chat">("chat");

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

  if (paywallError) {
    return (
      <div className="flex h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-10 shadow-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h2 className="mb-2 text-xl font-bold text-gray-900">免费体验已用完</h2>
            <p className="mb-6 text-sm text-gray-500">
              订阅会员，解锁全部真题、AI 老师、错题分析
            </p>
            <button
              onClick={() => router.push("/payment")}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              查看会员套餐
            </button>
            <button
              onClick={() => router.push("/problems")}
              className="mt-3 w-full rounded-lg border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50"
            >
              返回题库
            </button>
          </div>
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
              {problem.isVariant && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  变形题
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  LEVEL_COLORS[problem.level] || "bg-gray-100 text-gray-600"
                }`}
              >
                {problem.level}级
              </span>
              {problem.isVariant ? (
                <span className="text-sm text-gray-400 font-mono">源题：{problem.sourceLuoguId}</span>
              ) : (
                <span className="text-sm text-gray-400 font-mono">{problem.luoguId}</span>
              )}
              {JSON.parse(problem.tags || "[]").map((tag: string) => {
                const s = tagStats[tag];
                const ratio = s && s.total > 0 ? s.ac / s.total : 0;
                // 颜色：灰=未开始，红=<30%，黄=30-70%，绿=≥70%
                const toneClass = !s || s.total === 0
                  ? "bg-sky-50 text-sky-700"
                  : s.ac === 0
                    ? "bg-rose-50 text-rose-700"
                    : ratio >= 0.7
                      ? "bg-emerald-50 text-emerald-700"
                      : ratio >= 0.3
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700";
                return (
                  <span
                    key={tag}
                    title={s ? `${tag}：已 AC ${s.ac} / 共 ${s.total} 道` : tag}
                    className={`rounded-full px-2 py-0.5 text-xs ${toneClass}`}
                  >
                    {tag}
                    {s && s.total > 0 && (
                      <span className="ml-1 font-mono opacity-80">
                        {s.ac}/{s.total}
                      </span>
                    )}
                  </span>
                );
              })}
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
              {selectedCode && (
                <button
                  onClick={() => {
                    setChatTrigger({
                      text: `请解释一下这段代码的含义：\n\`\`\`cpp\n${selectedCode}\n\`\`\``,
                      nonce: Date.now(),
                    });
                    setBottomTab("chat");
                  }}
                  className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
                >
                  解释选中代码
                </button>
              )}
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
                title="Ctrl/Cmd + Enter 快速提交"
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "判题中..." : "提交"}
              </button>
            </div>
          </div>

          {/* 编辑器（自适应填满） */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} height="100%" onSelectionChange={setSelectedCode} />
          </div>

          {/* 底部区域：结果 / AI老师 / 自定义输入 */}
          <div className="flex max-h-[40%] flex-col border-t bg-white">
            {/* 标签页切换 */}
            <div className="flex border-b text-sm">
              <button
                onClick={() => setBottomTab("chat")}
                className={`px-4 py-2 font-medium ${
                  bottomTab === "chat"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                GESP AI 私教
              </button>
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
                                <DiffPair expected={r.expectedOutput} actual={r.actualOutput || ""} />
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

                      {/* 非 AC：AI 错因分析卡 */}
                      {overallStatus !== "AC" && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                          {!errorAnalysis && !analysisLoading && !analysisError && (
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-rose-800">让 AI 老师帮你看看哪里出错了？</div>
                                <div className="mt-0.5 text-xs text-rose-600">结合本次提交代码，定位错误类型并给出自检清单</div>
                              </div>
                              <button
                                onClick={handleGenerateAnalysis}
                                className="ml-3 shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                              >
                                AI 错因分析
                              </button>
                            </div>
                          )}
                          {(analysisLoading || errorAnalysis) && (
                            <div>
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-sm font-medium text-rose-800">AI 错因分析</span>
                                {analysisLoading && <span className="text-xs text-rose-500">生成中...</span>}
                              </div>
                              <MdContent>
                                {errorAnalysis.replace(/【错误类型：.+?】\n?/, "").trimStart() || "…"}
                              </MdContent>
                            </div>
                          )}
                          {analysisError && (
                            <div className="mt-2 text-xs text-rose-700">{analysisError}</div>
                          )}
                        </div>
                      )}

                      {/* 非 AC & 源题页：变形题入口卡 */}
                      {overallStatus !== "AC" && !isVariantPage && variantInfo && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          {!variantInfo.isPaid ? (
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-amber-800">订阅解锁变形题，对症巩固</div>
                                <div className="mt-0.5 text-xs text-amber-700">做错之后练 2~4 道同考点变形题，彻底吃透</div>
                              </div>
                              <button
                                onClick={() => router.push("/payment")}
                                className="ml-3 shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                              >
                                查看会员套餐
                              </button>
                            </div>
                          ) : !variantInfo.hasAny ? (
                            <div>
                              <div className="text-sm font-medium text-amber-800">AI 正在为你准备变形题</div>
                              <div className="mt-0.5 text-xs text-amber-700">稍后再回来看看，就可以巩固同类型题目了</div>
                            </div>
                          ) : variantInfo.unlockedVariants.length === 0 ? (
                            <div className="text-sm text-amber-800">变形题即将就绪，请稍后刷新</div>
                          ) : (
                            <div>
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-sm font-medium text-amber-800">已解锁变形题，去练一练？</span>
                                <span className="text-xs text-amber-600">
                                  {variantInfo.unlockedVariants.length}/{variantInfo.totalVariants}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {variantInfo.unlockedVariants.map((v) => (
                                  <button
                                    key={v.id}
                                    onClick={() => router.push(`/problems/v${v.id}`)}
                                    className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                                  >
                                    {v.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {judgeResults.map((r, i) => (
                        <div key={i} className="rounded border p-2">
                          <div className="mb-1 flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-500">
                              {r.isHidden ? `隐藏点 #${i + 1}` : `样例 #${i + 1}`}
                            </span>
                            <span className={`text-sm font-bold ${STATUS_COLORS[r.status] || "text-gray-600"}`}>
                              {STATUS_TEXT[r.status] || r.status}
                            </span>
                            {r.time && <span className="text-xs text-gray-400">{(parseFloat(r.time) * 1000).toFixed(0)}ms</span>}
                            {r.memory && <span className="text-xs text-gray-400">{r.memory}KB</span>}
                            {!r.isHidden && r.status !== "AC" && r.status !== "CE" && (
                              <button
                                onClick={() => askAIAboutCase(r)}
                                className="ml-auto rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                让 AI 帮我看这个样例
                              </button>
                            )}
                          </div>
                          {r.status !== "AC" && !r.isHidden && (
                            <DiffPair expected={r.expectedOutput || ""} actual={r.actualOutput || ""} />
                          )}
                          {r.status !== "AC" && r.isHidden && (
                            <div className="text-xs text-gray-400">隐藏测试点不展示具体数据，建议先用样例调试</div>
                          )}
                        </div>
                      ))}
                      {/* AC 时展示代码点评入口 */}
                      {overallStatus === "AC" && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-green-800">通过了！试试让 AI 帮你找更优解？</div>
                              <div className="text-xs text-green-600 mt-0.5">分析时间复杂度、代码风格、有无更简洁的写法</div>
                            </div>
                            <button
                              onClick={() => {
                                setChatTrigger({
                                  text: "我刚才 AC 了这道题，请帮我点评一下代码，有没有可以优化的地方？比如时间复杂度、代码风格、更简洁的写法等。",
                                  code,
                                  nonce: Date.now(),
                                });
                                setBottomTab("chat");
                              }}
                              className="ml-3 shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                            >
                              AI 点评代码
                            </button>
                          </div>
                        </div>
                      )}

                      {/* AC 后推荐下一题（弱点驱动） */}
                      {overallStatus === "AC" && recommend && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                          {recommend.problem ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs text-indigo-600">推荐下一题</div>
                                <div className="mt-0.5 truncate text-sm font-medium text-indigo-900">
                                  {recommend.problem.title}
                                </div>
                                <div className="mt-0.5 text-xs text-indigo-700">{recommend.reason}</div>
                              </div>
                              <button
                                onClick={() => router.push(`/problems/${recommend.problem!.id}`)}
                                className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                              >
                                去挑战
                              </button>
                            </div>
                          ) : recommend.upgrade ? (
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-indigo-900">🎉 {recommend.reason}</div>
                              </div>
                              <button
                                onClick={() => router.push(`/problems?level=${recommend.upgrade}`)}
                                className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                              >
                                挑战 {recommend.upgrade} 级
                              </button>
                            </div>
                          ) : (
                            <div className="text-sm text-indigo-900">🎉 {recommend.reason}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 提交记录 */}
                  {submissions.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-gray-900">提交记录</h3>
                      <div className="space-y-1">
                        {submissions.map((s, idx) => {
                          // 列表按时间降序，idx+1 是上一次（更旧）
                          const older = submissions[idx + 1];
                          return (
                            <div key={s.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                              <span className={`font-bold ${STATUS_COLORS[s.status] || "text-gray-600"}`}>
                                {STATUS_TEXT[s.status] || s.status}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-gray-400">
                                {s.timeUsed != null && <span>{s.timeUsed}ms</span>}
                                {s.memoryUsed != null && <span>{s.memoryUsed}KB</span>}
                                <span>
                                  {new Date(s.createdAt).toLocaleString("zh-CN", {
                                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                                  })}
                                </span>
                                {older && (
                                  <button
                                    onClick={() => setDiffPair({ newId: s.id, oldId: older.id })}
                                    className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                                    title="与上一次提交对比代码"
                                  >
                                    vs 上一次
                                  </button>
                                )}
                                <button
                                  onClick={() => setViewingSubmissionId(s.id)}
                                  className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                  查看代码
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bottomTab === "chat" && (
                <ChatPanel
                  problemId={isVariantPage ? undefined : numericId}
                  variantId={isVariantPage ? numericId : undefined}
                  code={code}
                  triggerSend={chatTrigger}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingSubmissionId !== null && (
        <SubmissionDetailModal
          submissionId={viewingSubmissionId}
          variant={isVariantPage}
          onClose={() => setViewingSubmissionId(null)}
          onLoad={handleLoadSubmission}
        />
      )}

      {diffPair && (
        <SubmissionDiffModal
          newId={diffPair.newId}
          oldId={diffPair.oldId}
          variant={isVariantPage}
          onClose={() => setDiffPair(null)}
        />
      )}
    </div>
  );
}
