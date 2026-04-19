"use client";

import { Fragment, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  testCases?: string;
  verifiedAt?: string | null;
  verifiedCount?: number;
  reviewReport?: string | null;
  lastReviewedAt?: string | null;
}

interface ReviewIssue {
  index: number;
  input: string;
  expectedOutput: string;
  opusOutput: string;
  status: "pass" | "mismatch" | "error";
}

interface ReviewReport {
  reviewedAt: string;
  model: string;
  modelDisplay?: string;
  total: number;
  passed: number;
  failed: number;
  issues: ReviewIssue[];
  status?: "oracle_failed";
  reason?: string;
}

function parseReviewReport(raw?: string | null): ReviewReport | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ReviewReport; } catch { return null; }
}

interface ImportResult {
  luoguId: string;
  title: string;
  id: number;
  status: "ok" | "error";
  error?: string;
}

interface VariantDetail {
  id: number;
  title: string;
  genStatus: string;
  genError?: string;
  verifiedCount: number;
  createdAt: string;
  verifiedAt?: string | null;
  reviewReport?: string | null;
  lastReviewedAt?: string | null;
}

export default function AdminProblemsPage() {
  const [tab, setTab] = useState<"list" | "single" | "batch">("list");

  // === 题目列表 ===
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Problem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    luoguId: "", title: "", level: "1", description: "",
    inputFormat: "", outputFormat: "", samples: "[]", testCases: "[]",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // === 单题导入 ===
  const [luoguId, setLuoguId] = useState("");
  const [importLevel, setImportLevel] = useState("0");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [importHistory, setImportHistory] = useState<Array<{ luoguId: string; title: string; id: number }>>([]);

  // === AI 打标签 ===
  const [aiTagLoading, setAiTagLoading] = useState(false);
  const [aiTagStatus, setAiTagStatus] = useState("");
  const [aiTagErrors, setAiTagErrors] = useState<{ luoguId: string; error: string }[]>([]);

  async function runAiTag(all: boolean) {
    setAiTagLoading(true);
    setAiTagStatus("准备中...");
    setAiTagErrors([]);
    try {
      const res = await fetch("/api/admin/problems/ai-tag", {
        method: "POST", headers, body: JSON.stringify(all ? { all: true } : {}),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                setAiTagStatus(data.message);
                fetchProblems();
              } else if (data.status === "error") {
                setAiTagStatus(`${data.current}/${data.total} ${data.luoguId} ✗ ${data.error}`);
                setAiTagErrors((prev) => [...prev, { luoguId: data.luoguId, error: data.error }]);
              } else {
                setAiTagStatus(`${data.current}/${data.total} ${data.luoguId} ✓`);
              }
            } catch {}
          }
        }
      }
    } catch {
      setAiTagStatus("网络错误，请重试");
    }
    setAiTagLoading(false);
  }

  async function handleClearTags() {
    if (!confirm("将清空所有题目的知识点标签，确定？")) return;
    if (!confirm("再次确认：真的要清空全部标签吗？")) return;
    const res = await fetch("/api/admin/problems/clear-tags", { method: "POST", headers });
    const data = await res.json();
    alert(data.message || data.error);
    fetchProblems();
  }

  async function handleAiTag() {
    if (!confirm("将用 AI 为所有尚未打标签的题目生成知识点标签，确定？")) return;
    await runAiTag(false);
  }


  // === 批量导入 ===
  const [batchUrl, setBatchUrl] = useState("");
  const [batchLevel, setBatchLevel] = useState("0");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchResults, setBatchResults] = useState<ImportResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<{ total: number; success: number; failed: number; skipped: number } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  function getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  // --- 题目列表逻辑 ---
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState("0");

  async function fetchProblems() {
    setLoading(true);
    const [res] = await Promise.all([
      fetch("/api/admin/problems", { headers }),
      fetchVariantSummary(),
    ]);
    if (res.ok) {
      const data = await res.json();
      setProblems(data.problems);
    }
    setLoading(false);
  }

  useEffect(() => { fetchProblems(); }, []);

  // 前端过滤 + 按级别排序
  const filteredProblems = problems
    .filter((p) => {
      const lvl = parseInt(filterLevel);
      if (lvl > 0 && p.level !== lvl) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.luoguId.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => a.level - b.level || a.luoguId.localeCompare(b.luoguId));

  function openNew() {
    setEditing(null);
    setForm({ luoguId: "", title: "", level: "1", description: "", inputFormat: "", outputFormat: "", samples: "[]", testCases: "[]" });
    setShowForm(true);
    setError("");
  }

  async function openEdit(id: number) {
    const res = await fetch("/api/admin/problems", { headers });
    if (!res.ok) return;
    const data = await res.json();
    const p = data.problems.find((x: any) => x.id === id);
    if (!p) return;
    setEditing(p);
    setForm({ luoguId: p.luoguId, title: p.title, level: String(p.level), description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat, samples: p.samples, testCases: p.testCases });
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const url = editing ? `/api/admin/problems/${editing.id}` : "/api/admin/problems";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify({ ...form, level: parseInt(form.level) }) });
    if (res.ok) { setShowForm(false); fetchProblems(); }
    else { const data = await res.json(); setError(data.error || "操作失败"); }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除这道题目？")) return;
    await fetch(`/api/admin/problems/${id}`, { method: "DELETE", headers });
    fetchProblems();
  }

  // --- 生成测试数据 ---
  const [generating, setGenerating] = useState<number | null>(null);
  const [genMsg, setGenMsg] = useState("");
  const [batchGenLevel, setBatchGenLevel] = useState("0");
  const [batchGenRunning, setBatchGenRunning] = useState(false);
  const [batchGenProgress, setBatchGenProgress] = useState("");
  const [batchGenResults, setBatchGenResults] = useState<Array<{ title: string; ok: boolean; msg: string }>>([]);

  async function handleGenerate(id: number) {
    if (generating || batchGenRunning) return;
    setGenerating(id);
    setGenMsg("正在生成测试数据（约2-3分钟）...");
    try {
      const res = await fetch(`/api/admin/problems/${id}/generate`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setGenMsg(`${data.message}（by ${data.model}）`);
        fetchProblems(); // 刷新列表以更新测试数据状态
      } else {
        setGenMsg(`失败: ${data.error}`);
      }
    } catch {
      setGenMsg("网络错误");
    }
    setGenerating(null);
    setTimeout(() => setGenMsg(""), 8000);
  }

  async function handleBatchGenerate() {
    if (batchGenRunning || generating) return;
    const level = parseInt(batchGenLevel);
    const allTargets = level > 0
      ? problems.filter((p) => p.level === level)
      : problems;

    // 跳过已有测试数据的题目
    const targets = allTargets.filter((p) => getTestCaseCount(p) === 0);
    const skipped = allTargets.length - targets.length;

    if (allTargets.length === 0) {
      setBatchGenProgress("没有找到符合条件的题目");
      return;
    }
    if (targets.length === 0) {
      setBatchGenProgress(`该级别 ${allTargets.length} 道题全部已有测试数据，无需生成`);
      return;
    }
    if (!confirm(`${allTargets.length} 道题中 ${skipped} 道已有测试数据将跳过，为剩余 ${targets.length} 道生成？每道约需2-3分钟。`)) return;

    setBatchGenRunning(true);
    setBatchGenResults([]);
    if (skipped > 0) {
      setBatchGenResults([{ title: `${skipped} 道题已有测试数据`, ok: true, msg: "跳过" }]);
    }
    let success = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setBatchGenProgress(`正在生成 ${i + 1}/${targets.length}: ${p.title}...`);
      setGenerating(p.id);

      try {
        const res = await fetch(`/api/admin/problems/${p.id}/generate`, { method: "POST", headers });
        const data = await res.json();
        if (res.ok) {
          success++;
          setBatchGenResults((prev) => [...prev, { title: p.title, ok: true, msg: `${data.count} 个测试点` }]);
        } else {
          failed++;
          setBatchGenResults((prev) => [...prev, { title: p.title, ok: false, msg: data.error }]);
        }
      } catch {
        failed++;
        setBatchGenResults((prev) => [...prev, { title: p.title, ok: false, msg: "网络错误" }]);
      }

      setGenerating(null);
    }

    setBatchGenProgress(`批量生成完成：成功 ${success}，失败 ${failed}，跳过 ${skipped}`);
    setBatchGenRunning(false);
    fetchProblems();
  }

  async function handleClearAll() {
    if (!confirm("确定清空所有题目？此操作会同时删除所有提交记录、错题本和聊天记录，不可恢复！")) return;
    if (!confirm("再次确认：真的要删除全部题目吗？")) return;
    const res = await fetch("/api/admin/problems/clear", { method: "DELETE", headers });
    const data = await res.json();
    if (res.ok) { alert(data.message); fetchProblems(); }
    else { alert(data.error || "清空失败"); }
  }

  // --- 变形题生成 ---
  const [variantSummary, setVariantSummary]     = useState<Record<number, Record<string, number>>>({});
  const [variantGenRunning, setVariantGenRunning] = useState<number | null>(null);
  const [variantGenMsg, setVariantGenMsg]         = useState("");
  const [batchVariantRunning, setBatchVariantRunning] = useState(false);
  const [batchVariantProgress, setBatchVariantProgress] = useState("");
  const [batchVariantResults, setBatchVariantResults]   = useState<Array<{ title: string; ok: boolean; msg: string }>>([]);

  // --- 批量变形题级别筛选 ---
  const [batchVariantLevel, setBatchVariantLevel] = useState<string>("all");

  // --- 变形题展开查看 ---
  const [expandedProblemId, setExpandedProblemId] = useState<number | null>(null);
  const [variantDetails, setVariantDetails]       = useState<Record<number, VariantDetail[]>>({});

  async function toggleVariantExpand(problemId: number) {
    if (expandedProblemId === problemId) {
      setExpandedProblemId(null);
      return;
    }
    setExpandedProblemId(problemId);
    await refreshVariantDetails(problemId);
  }

  async function refreshVariantDetails(problemId: number) {
    const res = await fetch(`/api/admin/variants?problemId=${problemId}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setVariantDetails((prev) => ({ ...prev, [problemId]: data.variants ?? [] }));
    }
  }

  async function handleDeleteVariant(variantId: number, problemId: number) {
    if (!confirm(`确定删除变形题 v${variantId}？此操作不可撤销。`)) return;
    const res = await fetch(`/api/admin/variants?variantId=${variantId}`, {
      method: "DELETE",
      headers,
    });
    if (res.ok) {
      await refreshVariantDetails(problemId);
      await fetchVariantSummary();
    } else {
      const data = await res.json();
      alert(data.error ?? "删除失败");
    }
  }

  async function fetchVariantSummary() {
    const res = await fetch("/api/admin/variants", { headers });
    if (res.ok) {
      const data = await res.json();
      setVariantSummary(data.summary ?? {});
    }
  }

  async function handleGenerateVariants(id: number) {
    if (variantGenRunning !== null || batchVariantRunning) return;
    setVariantGenRunning(id);
    setVariantGenMsg("正在生成变形题...");
    try {
      const res = await fetch("/api/admin/variants", {
        method: "POST",
        headers,
        body: JSON.stringify({ problemId: id }),
      });
      if (!res.body) throw new Error("no stream");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            setVariantGenMsg(data.message ?? "");
            if (data.done) { fetchVariantSummary(); }
          } catch {}
        }
      }
    } catch (e: any) {
      setVariantGenMsg("网络错误: " + e.message);
    }
    setVariantGenRunning(null);
    setTimeout(() => setVariantGenMsg(""), 10000);
  }

  async function handleBatchGenerateVariants() {
    if (batchVariantRunning || variantGenRunning !== null) return;
    const levelLabel = batchVariantLevel === "all" ? "所有级别" : `${batchVariantLevel} 级`;
    if (!confirm(`批量为【${levelLabel}】不足 4 道变形题的题目生成变形题？每道约需10分钟，请确保网络稳定。`)) return;
    setBatchVariantRunning(true);
    setBatchVariantResults([]);
    setBatchVariantProgress("启动批量变形题生成...");
    try {
      const levelQuery = batchVariantLevel !== "all" ? `&level=${batchVariantLevel}` : "";
      const res = await fetch(`/api/admin/variants?batch=1${levelQuery}`, { method: "POST", headers });
      if (!res.body) throw new Error("no stream");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            setBatchVariantProgress(data.message ?? "");
            if (data.step === "done_one") {
              setBatchVariantResults((prev) => [...prev, { title: `变形题 #${data.variantId}`, ok: true, msg: data.message }]);
            } else if (data.step === "error_one") {
              setBatchVariantResults((prev) => [...prev, { title: "生成失败", ok: false, msg: data.message }]);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setBatchVariantProgress("网络错误: " + (e as any).message);
    }
    setBatchVariantRunning(false);
    fetchVariantSummary();
  }

  // --- 复核变形题样例/测试点 ---
  const [variantVerifying, setVariantVerifying] = useState<number | null>(null);
  const [variantVerifyMsg, setVariantVerifyMsg] = useState("");

  async function handleVerifyVariants(problemId: number) {
    if (variantVerifying !== null || batchVariantVerifyRunning) return;
    setVariantVerifying(problemId);
    setVariantVerifyMsg("正在复核变形题...");
    try {
      const res = await fetch("/api/admin/variants/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ problemId }),
      });
      if (!res.body) throw new Error("no stream");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let lastMsg = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            lastMsg = data.message ?? lastMsg;
            setVariantVerifyMsg(lastMsg);
          } catch {}
        }
      }
      setVariantVerifyMsg(lastMsg || "复核完成");
    } catch (e: any) {
      setVariantVerifyMsg("复核失败: " + e.message);
    }
    setVariantVerifying(null);
    fetchVariantSummary();
  }

  const [batchVariantVerifyRunning, setBatchVariantVerifyRunning] = useState(false);
  const [batchVariantVerifyLevel, setBatchVariantVerifyLevel] = useState<string>("all");
  const [batchVariantVerifyProgress, setBatchVariantVerifyProgress] = useState("");
  const [batchVariantVerifyResults, setBatchVariantVerifyResults] = useState<Array<{ title: string; status: string; msg: string }>>([]);

  async function handleBatchVerifyVariants() {
    if (batchVariantVerifyRunning) return;
    const levelLabel = batchVariantVerifyLevel === "all" ? "所有级别" : `${batchVariantVerifyLevel} 级`;
    if (!confirm(`用 Opus 复核【${levelLabel}】所有变形题的样例和测试点？每道约需 2-3 分钟。`)) return;
    setBatchVariantVerifyRunning(true);
    setBatchVariantVerifyResults([]);
    setBatchVariantVerifyProgress("启动变形题复核...");
    try {
      const levelQuery = batchVariantVerifyLevel !== "all" ? `&level=${batchVariantVerifyLevel}` : "";
      const res = await fetch(`/api/admin/variants/verify?batch=1${levelQuery}`, { method: "POST", headers, body: "{}" });
      if (!res.body) throw new Error("no stream");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            setBatchVariantVerifyProgress(data.message ?? "");
            if (data.step === "result") {
              setBatchVariantVerifyResults((prev) => [...prev, {
                title: data.title ?? `v${data.variantId}`,
                status: data.status,
                msg: data.message,
              }]);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setBatchVariantVerifyProgress("网络错误: " + (e as any).message);
    }
    setBatchVariantVerifyRunning(false);
    fetchVariantSummary();
  }

  // --- 复核测试数据 ---
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [batchVerifyLevel, setBatchVerifyLevel] = useState("0");
  const [batchVerifyRunning, setBatchVerifyRunning] = useState(false);
  const [batchVerifyProgress, setBatchVerifyProgress] = useState("");
  const [batchVerifyResults, setBatchVerifyResults] = useState<Array<{ title: string; ok: boolean; msg: string }>>([]);

  // --- 再复核（非破坏性）---
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviewMsg, setReviewMsg] = useState("");
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null);
  const [batchReviewLevel, setBatchReviewLevel] = useState("0");
  const [batchReviewRunning, setBatchReviewRunning] = useState(false);
  const [batchReviewProgress, setBatchReviewProgress] = useState("");
  const [batchReviewResults, setBatchReviewResults] = useState<Array<{ title: string; failed: number; total: number; error?: string; oracleFailed?: boolean; reason?: string }>>([]);

  // --- 变形题再复核 ---
  const [variantReviewing, setVariantReviewing] = useState<number | null>(null);
  const [variantReviewMsg, setVariantReviewMsg] = useState("");
  const [expandedVariantReviewId, setExpandedVariantReviewId] = useState<number | null>(null);

  // 带 502 重试的 fetch
  async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 502 && i < retries) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        return res;
      } catch (e) {
        if (i === retries) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    throw new Error("请求失败");
  }

  // 判断题目是否有测试用例
  function getTestCaseCount(p: Problem): number {
    try {
      const tc = JSON.parse(p.testCases || "[]");
      return Array.isArray(tc) ? tc.length : 0;
    } catch { return 0; }
  }

  // 判断题目是否已全部复核通过
  function isFullyVerified(p: Problem): boolean {
    if (!p.verifiedAt) return false;
    const tcCount = getTestCaseCount(p);
    return tcCount > 0 && (p.verifiedCount ?? 0) === tcCount;
  }

  async function handleVerify(id: number) {
    if (verifying || batchVerifyRunning || generating || batchGenRunning) return;
    setVerifying(id);
    setVerifyMsg("正在用 Opus 复核测试用例...");
    try {
      const res = await fetchWithRetry(`/api/admin/problems/${id}/verify`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setVerifyMsg(`${data.message}（by ${data.model}）`);
        fetchProblems();
      } else {
        setVerifyMsg(`失败: ${data.error}`);
      }
    } catch {
      setVerifyMsg("网络错误");
    }
    setVerifying(null);
    setTimeout(() => setVerifyMsg(""), 8000);
  }

  async function handleBatchVerify() {
    if (batchVerifyRunning || verifying || generating || batchGenRunning) return;
    const level = parseInt(batchVerifyLevel);
    const levelProblems = level > 0 ? problems.filter((p) => p.level === level) : problems;

    // 过滤：跳过无测试用例 + 跳过已全部复核通过的
    const targets = levelProblems.filter((p) => getTestCaseCount(p) > 0 && !isFullyVerified(p));
    const skippedNoTc = levelProblems.filter((p) => getTestCaseCount(p) === 0).length;
    const skippedVerified = levelProblems.filter((p) => getTestCaseCount(p) > 0 && isFullyVerified(p)).length;

    if (targets.length === 0) {
      const reasons = [];
      if (skippedNoTc > 0) reasons.push(`${skippedNoTc} 题无测试用例`);
      if (skippedVerified > 0) reasons.push(`${skippedVerified} 题已通过复核`);
      setBatchVerifyProgress(`没有需要复核的题目${reasons.length > 0 ? `（${reasons.join("，")}）` : ""}`);
      return;
    }

    const skipInfo = [];
    if (skippedNoTc > 0) skipInfo.push(`${skippedNoTc} 题无测试用例已跳过`);
    if (skippedVerified > 0) skipInfo.push(`${skippedVerified} 题已通过复核已跳过`);
    const skipText = skipInfo.length > 0 ? `\n（${skipInfo.join("，")}）` : "";

    if (!confirm(`确定要用 Opus 复核 ${targets.length} 道${level > 0 ? ` ${level}级` : ""}题目的测试数据？每道题约需2-3分钟。${skipText}`)) return;

    setBatchVerifyRunning(true);
    setBatchVerifyResults([]);
    let ok = 0;
    let bad = 0;

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setBatchVerifyProgress(`正在复核 ${i + 1}/${targets.length}: ${p.title}...`);
      setVerifying(p.id);

      try {
        const res = await fetchWithRetry(`/api/admin/problems/${p.id}/verify`, { method: "POST", headers });
        const data = await res.json();
        if (res.ok) {
          const hasIssue = data.failed > 0;
          if (hasIssue) bad++; else ok++;
          setBatchVerifyResults((prev) => [...prev, {
            title: p.title,
            ok: !hasIssue,
            msg: hasIssue ? `${data.failed} 个不一致已移除，剩余 ${data.remaining}` : `全部 ${data.total} 个通过`,
          }]);
        } else {
          bad++;
          setBatchVerifyResults((prev) => [...prev, { title: p.title, ok: false, msg: data.error }]);
        }
      } catch {
        bad++;
        setBatchVerifyResults((prev) => [...prev, { title: p.title, ok: false, msg: "网络错误" }]);
      }

      setVerifying(null);
    }

    setBatchVerifyProgress(`复核完成：${ok} 题全通过，${bad} 题有问题（已自动清理）`);
    setBatchVerifyRunning(false);
    fetchProblems();
  }

  // --- 再复核：不删除 testCases，只写 reviewReport ---
  async function handleReview(id: number) {
    if (reviewing || batchReviewRunning) return;
    setReviewing(id);
    setReviewMsg("正在用 Opus 4.7 再复核（不删除测试点，仅记录差异）...");
    try {
      const res = await fetchWithRetry(`/api/admin/problems/${id}/review`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setReviewMsg(`${data.message}（by ${data.modelDisplay || data.model}）`);
        setExpandedReviewId(id);
        fetchProblems();
      } else {
        setReviewMsg(`失败: ${data.error}`);
      }
    } catch {
      setReviewMsg("网络错误");
    }
    setReviewing(null);
    setTimeout(() => setReviewMsg(""), 10000);
  }

  async function handleBatchReview() {
    if (batchReviewRunning || reviewing || verifying || generating || batchVerifyRunning || batchGenRunning) return;
    const level = parseInt(batchReviewLevel);
    const levelProblems = level > 0 ? problems.filter((p) => p.level === level) : problems;
    const targets = levelProblems.filter((p) => getTestCaseCount(p) > 0);

    if (targets.length === 0) {
      setBatchReviewProgress("没有需要再复核的题目（无测试用例）");
      return;
    }
    if (!confirm(`用 Opus 4.7 再复核 ${targets.length} 道${level > 0 ? ` ${level}级` : ""}题目？每道约 2-3 分钟，不会删除测试点，只记录差异。`)) return;

    setBatchReviewRunning(true);
    setBatchReviewResults([]);
    let okCount = 0;
    let badCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setBatchReviewProgress(`再复核 ${i + 1}/${targets.length}: ${p.title}...`);
      setReviewing(p.id);
      try {
        const res = await fetchWithRetry(`/api/admin/problems/${p.id}/review`, { method: "POST", headers });
        const data = await res.json();
        if (res.ok) {
          if (data.status === "oracle_failed") {
            skippedCount++;
            setBatchReviewResults((prev) => [...prev, { title: p.title, failed: 0, total: 0, oracleFailed: true, reason: data.reason }]);
          } else {
            const failed = data.failed ?? 0;
            if (failed > 0) badCount++; else okCount++;
            setBatchReviewResults((prev) => [...prev, { title: p.title, failed, total: data.total ?? 0 }]);
          }
        } else {
          badCount++;
          setBatchReviewResults((prev) => [...prev, { title: p.title, failed: 0, total: 0, error: data.error }]);
        }
      } catch {
        badCount++;
        setBatchReviewResults((prev) => [...prev, { title: p.title, failed: 0, total: 0, error: "网络错误" }]);
      }
      setReviewing(null);
    }

    setBatchReviewProgress(`再复核完成：${okCount} 题全通过，${badCount} 题有差异待人工审阅${skippedCount > 0 ? `，${skippedCount} 题 Opus 无法验证` : ""}`);
    setBatchReviewRunning(false);
    fetchProblems();
  }

  async function handleVariantReview(vid: number, problemId: number) {
    if (variantReviewing) return;
    setVariantReviewing(vid);
    setVariantReviewMsg(`正在用 Opus 4.7 再复核变形题 v${vid}...`);
    try {
      const res = await fetchWithRetry(`/api/admin/variants/${vid}/review`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setVariantReviewMsg(`${data.message}（by ${data.modelDisplay || data.model}）`);
        setExpandedVariantReviewId(vid);
        await refreshVariantDetails(problemId);
      } else {
        setVariantReviewMsg(`失败: ${data.error}`);
      }
    } catch {
      setVariantReviewMsg("网络错误");
    }
    setVariantReviewing(null);
    setTimeout(() => setVariantReviewMsg(""), 10000);
  }

  // --- 单题导入逻辑 ---
  async function handleSingleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!luoguId.trim() || importLoading) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST", headers,
        body: JSON.stringify({ luoguId: luoguId.trim().toUpperCase(), level: importLevel !== "0" ? parseInt(importLevel) : undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult({ success: true, message: `${data.problem.title} 导入成功` });
        setImportHistory((prev) => [{ luoguId: data.problem.luoguId, title: data.problem.title, id: data.problem.id }, ...prev]);
        setLuoguId("");
        fetchProblems();
      } else {
        setImportResult({ success: false, message: data.error || "导入失败" });
      }
    } catch { setImportResult({ success: false, message: "网络错误" }); }
    setImportLoading(false);
  }

  // --- 批量导入逻辑 ---
  async function handleBatchImport(e: React.FormEvent) {
    e.preventDefault();
    if (!batchUrl.trim() || batchLoading) return;
    setBatchLoading(true);
    setBatchStatus("正在从洛谷获取题目列表...");
    setBatchResults([]);
    setBatchSummary(null);

    try {
      // 1. 获取题号列表
      const listRes = await fetch("/api/admin/import/list", {
        method: "POST", headers,
        body: JSON.stringify({ luoguUrl: batchUrl.trim() }),
      });
      const listData = await listRes.json();
      if (!listRes.ok) {
        setBatchStatus(listData.error || "获取列表失败");
        setBatchLoading(false);
        return;
      }

      const { toImport, existing, total } = listData;
      const skipped = existing.length;
      setBatchStatus(`找到 ${total} 道题，${skipped} 道已存在，开始导入 ${toImport.length} 道...`);
      setBatchSummary({ total, success: 0, failed: 0, skipped });

      // 2. 逐个导入，实时更新进度
      let success = 0;
      let failed = 0;
      const levelParam = batchLevel !== "0" ? parseInt(batchLevel) : undefined;

      for (let i = 0; i < toImport.length; i++) {
        const pid = toImport[i];
        setBatchStatus(`正在导入 ${i + 1}/${toImport.length}: ${pid}...`);

        try {
          const res = await fetch("/api/admin/import", {
            method: "POST", headers,
            body: JSON.stringify({ luoguId: pid, level: levelParam }),
          });
          const data = await res.json();
          if (res.ok) {
            success++;
            setBatchResults((prev) => [...prev, { luoguId: pid, title: data.problem.title, id: data.problem.id, status: "ok" }]);
          } else {
            failed++;
            setBatchResults((prev) => [...prev, { luoguId: pid, title: "", id: 0, status: "error", error: data.error }]);
          }
        } catch {
          failed++;
          setBatchResults((prev) => [...prev, { luoguId: pid, title: "", id: 0, status: "error", error: "网络错误" }]);
        }

        setBatchSummary({ total, success, failed, skipped });

        // 间隔避免限流
        if (i < toImport.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      setBatchSummary({ total, success, failed, skipped });
      setBatchStatus(`导入完成：成功 ${success}，失败 ${failed}，跳过已存在 ${skipped}`);
      fetchProblems();
    } catch (err: any) {
      setBatchStatus("导入失败: " + (err.message || "未知错误"));
    }
    setBatchLoading(false);
  }

  // --- 级别选择组件 ---
  function LevelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border px-4 py-2.5 text-sm">
        <option value="0">自动识别</option>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (<option key={l} value={l}>{l}级</option>))}
      </select>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">题目管理</h1>

        {/* Tab */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          {([["list", "题目列表"], ["single", "单题导入"], ["batch", "批量导入"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === key ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ===== 题目列表 ===== */}
        {tab === "list" && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索题号或标题..."
                className="flex-1 min-w-[200px] rounded-md border px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                <option value="0">全部级别</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                  <option key={l} value={l}>{l}级</option>
                ))}
              </select>
              <span className="text-sm text-gray-400">{filteredProblems.length}/{problems.length} 题</span>
              <div className="flex gap-2 ml-auto">
                <button onClick={handleClearTags}
                  disabled={aiTagLoading}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                  清空标签
                </button>
                <button onClick={handleAiTag}
                  disabled={aiTagLoading}
                  className="rounded-md border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                  {aiTagLoading ? "打标中..." : "AI 打标签"}
                </button>

                {aiTagStatus && (
                  <span className="text-xs text-sky-600">{aiTagStatus}</span>
                )}
                {aiTagErrors.length > 0 && (
                  <div className="w-full mt-1 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
                    失败 {aiTagErrors.length} 道：{aiTagErrors.map((e) => `${e.luoguId}（${e.error}）`).join("、")}
                  </div>
                )}
                <button onClick={handleClearAll}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
                  清空全部
                </button>
                <button onClick={openNew}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                  手动添加
                </button>
              </div>
            </div>

            {/* 批量生成测试用例 */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">批量生成测试用例</span>
                <select
                  value={batchGenLevel}
                  onChange={(e) => setBatchGenLevel(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={batchGenRunning}
                >
                  <option value="0">全部级别</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                    <option key={l} value={l}>{l}级（{problems.filter((p) => p.level === l).length} 题）</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchGenerate}
                  disabled={batchGenRunning || generating !== null}
                  className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {batchGenRunning ? "生成中..." : "开始生成"}
                </button>
              </div>

              {batchGenProgress && (
                <div className={`mt-3 text-sm ${batchGenRunning ? "text-yellow-700" : batchGenProgress.includes("失败") ? "text-red-600" : "text-green-700"}`}>
                  {batchGenProgress}
                </div>
              )}

              {batchGenResults.length > 0 && (
                <div className="mt-3 max-h-48 space-y-1 overflow-auto">
                  {batchGenResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{r.title}</span>
                      <span className={r.ok ? "text-green-600" : "text-red-600"}>
                        {r.ok ? r.msg : `失败: ${r.msg}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 批量复核测试数据 */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">批量复核测试用例</span>
                <select
                  value={batchVerifyLevel}
                  onChange={(e) => setBatchVerifyLevel(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={batchVerifyRunning}
                >
                  <option value="0">全部级别</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                    <option key={l} value={l}>{l}级（{problems.filter((p) => p.level === l).length} 题）</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchVerify}
                  disabled={batchVerifyRunning || batchGenRunning || generating !== null || verifying !== null}
                  className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {batchVerifyRunning ? "复核中..." : "开始复核"}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">用 Opus 4.6 独立写解法跑所有测试点，不一致的自动移除</p>

              {batchVerifyProgress && (
                <div className={`mt-3 text-sm ${batchVerifyRunning ? "text-yellow-700" : batchVerifyProgress.includes("问题") ? "text-orange-600" : "text-purple-700"}`}>
                  {batchVerifyProgress}
                </div>
              )}

              {batchVerifyResults.length > 0 && (
                <div className="mt-3 max-h-48 space-y-1 overflow-auto">
                  {batchVerifyResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{r.title}</span>
                      <span className={r.ok ? "text-purple-600" : "text-orange-600"}>
                        {r.msg}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 批量再复核测试数据（非破坏性） */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">批量再复核测试用例</span>
                <select
                  value={batchReviewLevel}
                  onChange={(e) => setBatchReviewLevel(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={batchReviewRunning}
                >
                  <option value="0">全部级别</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                    <option key={l} value={l}>{l}级（{problems.filter((p) => p.level === l).length} 题）</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchReview}
                  disabled={batchReviewRunning || batchVerifyRunning || batchGenRunning || generating !== null || verifying !== null || reviewing !== null}
                  className="rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {batchReviewRunning ? "再复核中..." : "开始再复核"}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">Opus 4.7 独立写解法跑全部测试点，仅记录不一致项，不删除任何测试点</p>

              {batchReviewProgress && (
                <div className={`mt-3 text-sm ${batchReviewRunning ? "text-yellow-700" : batchReviewProgress.includes("差异") ? "text-orange-600" : "text-rose-700"}`}>
                  {batchReviewProgress}
                </div>
              )}

              {batchReviewResults.length > 0 && (
                <div className="mt-3 max-h-48 space-y-1 overflow-auto">
                  {batchReviewResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{r.title}</span>
                      <span className={r.error ? "text-red-600" : r.oracleFailed ? "text-gray-500" : r.failed > 0 ? "text-orange-600" : "text-rose-600"}>
                        {r.error
                          ? `失败: ${r.error}`
                          : r.oracleFailed
                            ? `⊘ Opus 无法验证${r.reason ? ` (${r.reason.slice(0, 40)})` : ""}`
                            : r.failed > 0
                              ? `${r.failed}/${r.total} 待审`
                              : `全部 ${r.total} 通过`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 批量生成变形题 */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">批量生成变形题</span>
                <select
                  value={batchVariantLevel}
                  onChange={(e) => setBatchVariantLevel(e.target.value)}
                  disabled={batchVariantRunning}
                  className="rounded-md border px-2 py-1 text-sm text-gray-700 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="all">全部级别</option>
                  {[1,2,3,4,5,6,7,8].map((l) => (
                    <option key={l} value={l}>{l} 级</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchGenerateVariants}
                  disabled={batchVariantRunning || variantGenRunning !== null}
                  className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {batchVariantRunning ? "生成中..." : "批量生成变形题"}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">为所有不足 4 道变形题的题目补充生成，每道约需 10 分钟</p>

              {batchVariantProgress && (
                <div className={`mt-3 text-sm ${batchVariantRunning ? "text-yellow-700" : "text-amber-700"}`}>
                  {batchVariantProgress}
                </div>
              )}

              {batchVariantResults.length > 0 && (
                <div className="mt-3 max-h-40 space-y-1 overflow-auto">
                  {batchVariantResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{r.title}</span>
                      <span className={r.ok ? "text-amber-600" : "text-red-600"}>{r.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 批量复核变形题 */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">批量复核变形题</span>
                <select
                  value={batchVariantVerifyLevel}
                  onChange={(e) => setBatchVariantVerifyLevel(e.target.value)}
                  disabled={batchVariantVerifyRunning}
                  className="rounded-md border px-2 py-1 text-sm text-gray-700 focus:border-teal-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="all">全部级别</option>
                  {[1,2,3,4,5,6,7,8].map((l) => (
                    <option key={l} value={l}>{l} 级</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchVerifyVariants}
                  disabled={batchVariantVerifyRunning || batchVariantRunning || variantGenRunning !== null}
                  className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {batchVariantVerifyRunning ? "复核中..." : "开始复核"}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">用 Opus 验证所有变形题的样例输出和测试点正确性，发现错误自动修复</p>

              {batchVariantVerifyProgress && (
                <div className={`mt-3 text-sm ${batchVariantVerifyRunning ? "text-yellow-700" : "text-teal-700"}`}>
                  {batchVariantVerifyProgress}
                </div>
              )}

              {batchVariantVerifyResults.length > 0 && (
                <div className="mt-3 max-h-40 space-y-1 overflow-auto">
                  {batchVariantVerifyResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{r.title}</span>
                      <span className={
                        r.status === "pass" ? "text-green-600" :
                        r.status === "fixed" ? "text-amber-600" :
                        "text-red-600"
                      }>
                        {r.status === "pass" ? "✓ 通过" : r.status === "fixed" ? "⚡ 已修复" : "✗ 需检查"} {r.msg}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showForm && (
              <div className="mb-6 rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-lg font-semibold">{editing ? "编辑题目" : "手动添加题目"}</h2>
                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">洛谷ID</label>
                      <input value={form.luoguId} onChange={(e) => setForm({ ...form, luoguId: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm" required disabled={!!editing} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">标题</label>
                      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm" required />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">级别</label>
                      <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (<option key={l} value={l}>{l}级</option>))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">题目描述</label>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full rounded-md border px-3 py-2 text-sm" rows={5} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">输入格式</label>
                      <textarea value={form.inputFormat} onChange={(e) => setForm({ ...form, inputFormat: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm" rows={3} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">输出格式</label>
                      <textarea value={form.outputFormat} onChange={(e) => setForm({ ...form, outputFormat: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm" rows={3} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">样例 (JSON)</label>
                      <textarea value={form.samples} onChange={(e) => setForm({ ...form, samples: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={3} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">测试数据 (JSON)</label>
                      <textarea value={form.testCases} onChange={(e) => setForm({ ...form, testCases: e.target.value })}
                        className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={3} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "保存中..." : "保存"}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)}
                      className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">取消</button>
                  </div>
                </form>
              </div>
            )}

            {genMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${genMsg.includes("失败") || genMsg.includes("错误") ? "bg-red-50 text-red-600" : generating ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}`}>
                {genMsg}
              </div>
            )}

            {verifyMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${verifyMsg.includes("失败") || verifyMsg.includes("错误") ? "bg-red-50 text-red-600" : verifying ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700"}`}>
                {verifyMsg}
              </div>
            )}

            {reviewMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${reviewMsg.includes("失败") || reviewMsg.includes("错误") ? "bg-red-50 text-red-600" : reviewing ? "bg-yellow-50 text-yellow-700" : "bg-rose-50 text-rose-700"}`}>
                {reviewMsg}
              </div>
            )}

            {variantReviewMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${variantReviewMsg.includes("失败") || variantReviewMsg.includes("错误") ? "bg-red-50 text-red-600" : variantReviewing ? "bg-yellow-50 text-yellow-700" : "bg-rose-50 text-rose-700"}`}>
                {variantReviewMsg}
              </div>
            )}

            {variantVerifyMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${variantVerifyMsg.includes("失败") || variantVerifyMsg.includes("需检查") ? "bg-red-50 text-red-600" : variantVerifying ? "bg-yellow-50 text-yellow-700" : "bg-teal-50 text-teal-700"}`}>
                {variantVerifyMsg}
              </div>
            )}

            {variantGenMsg && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${variantGenMsg.includes("失败") || variantGenMsg.includes("错误") ? "bg-red-50 text-red-600" : variantGenRunning ? "bg-yellow-50 text-yellow-700" : "bg-amber-50 text-amber-700"}`}>
                {variantGenMsg}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-gray-500">加载中...</div>
            ) : problems.length === 0 ? (
              <div className="py-12 text-center text-gray-400">暂无题目，去"单题导入"或"批量导入"添加吧</div>
            ) : (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">
                      <th className="px-4 py-3 font-medium">洛谷ID</th>
                      <th className="px-4 py-3 font-medium">标题</th>
                      <th className="px-4 py-3 font-medium">级别</th>
                      <th className="px-4 py-3 font-medium">测试点</th>
                      <th className="px-4 py-3 font-medium">复核状态</th>
                      <th className="px-4 py-3 font-medium">变形题</th>
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProblems.map((p) => (
                      <Fragment key={p.id}>
                      <tr className="border-b last:border-b-0">
                        <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.luoguId}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{p.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{p.level}级</td>
                        <td className="px-4 py-3 text-sm">
                          {(() => {
                            const count = getTestCaseCount(p);
                            return count > 0
                              ? <span className="text-green-600">{count}</span>
                              : <span className="text-gray-300">0</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {(() => {
                            const tcCount = getTestCaseCount(p);
                            if (tcCount === 0) return <span className="text-gray-300">-</span>;
                            const report = parseReviewReport(p.reviewReport);
                            const reviewBadge = p.lastReviewedAt && report
                              ? (
                                <button
                                  onClick={() => setExpandedReviewId(expandedReviewId === p.id ? null : p.id)}
                                  title={`再复核 ${getTimeAgo(p.lastReviewedAt)}`}
                                  className={`ml-1 rounded px-1 text-xs hover:opacity-80 ${
                                    report.status === "oracle_failed"
                                      ? "bg-gray-200 text-gray-600"
                                      : report.failed > 0
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {report.status === "oracle_failed"
                                    ? "⊘ 无法验证"
                                    : report.failed > 0
                                      ? `⚠ ${report.failed}待审`
                                      : `✓ 再复核`}
                                </button>
                              )
                              : null;
                            if (!p.verifiedAt) return <>
                              <span className="text-gray-400">未复核</span>
                              {reviewBadge}
                            </>;
                            const vc = p.verifiedCount ?? 0;
                            const allPassed = vc === tcCount;
                            const timeAgo = getTimeAgo(p.verifiedAt);
                            return <>
                              {allPassed
                                ? <span className="text-green-600" title={timeAgo}>{vc}/{tcCount} &#10003;</span>
                                : <span className="text-amber-600" title={timeAgo}>{vc}/{tcCount} &#9888;</span>}
                              {reviewBadge}
                            </>;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {(() => {
                            const s = variantSummary[p.id] ?? {};
                            const ready        = s["ready"]      ?? 0;
                            const generating_v = s["generating"] ?? 0;
                            const failed       = s["failed"]     ?? 0;
                            if (ready === 0 && generating_v === 0 && failed === 0) {
                              return <span className="text-gray-300">-</span>;
                            }
                            return (
                              <button
                                onClick={() => toggleVariantExpand(p.id)}
                                className="flex items-center gap-1 hover:opacity-70"
                              >
                                <span className="text-xs">{expandedProblemId === p.id ? "▼" : "▶"}</span>
                                <span className={ready >= 4 ? "text-green-600" : "text-amber-600"}>
                                  {ready}/4
                                  {generating_v > 0 && <span className="ml-1 text-yellow-600">({generating_v}生成中)</span>}
                                  {failed > 0 && <span className="ml-1 text-red-500">({failed}失败)</span>}
                                </span>
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleGenerate(p.id)}
                            disabled={generating !== null || batchGenRunning || batchVerifyRunning}
                            className="mr-2 text-green-600 hover:underline disabled:opacity-50"
                          >
                            {generating === p.id ? "生成中..." : "生成"}
                          </button>
                          <button
                            onClick={() => handleVerify(p.id)}
                            disabled={verifying !== null || batchGenRunning || batchVerifyRunning}
                            className="mr-2 text-purple-600 hover:underline disabled:opacity-50"
                          >
                            {verifying === p.id ? "复核中..." : "复核"}
                          </button>
                          <button
                            onClick={() => handleReview(p.id)}
                            disabled={reviewing !== null || batchReviewRunning || getTestCaseCount(p) === 0}
                            title="Opus 4.7 再复核，不删除测试点"
                            className="mr-2 text-rose-600 hover:underline disabled:opacity-50"
                          >
                            {reviewing === p.id ? "再复核中..." : "再复核"}
                          </button>
                          <button
                            onClick={() => handleGenerateVariants(p.id)}
                            disabled={variantGenRunning !== null || batchVariantRunning}
                            title="生成变形题"
                            className={`mr-2 hover:underline disabled:opacity-50 ${(variantSummary[p.id]?.["ready"] ?? 0) >= 4 ? "text-gray-400" : "text-amber-600"}`}
                          >
                            {variantGenRunning === p.id ? "变形中..." : "变形题"}
                          </button>
                          {(variantSummary[p.id]?.["ready"] ?? 0) > 0 && (
                            <button
                              onClick={() => handleVerifyVariants(p.id)}
                              disabled={variantVerifying !== null || batchVariantVerifyRunning}
                              title="复核该题所有变形题的样例和测试点"
                              className="mr-2 text-teal-600 hover:underline disabled:opacity-50"
                            >
                              {variantVerifying === p.id ? "复核变形中..." : "复核变形"}
                            </button>
                          )}
                          <button onClick={() => openEdit(p.id)} className="mr-2 text-blue-600 hover:underline">编辑</button>
                          <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">删除</button>
                        </td>
                      </tr>
                      {expandedReviewId === p.id && (() => {
                        const report = parseReviewReport(p.reviewReport);
                        if (!report) return null;
                        const isOracleFailed = report.status === "oracle_failed";
                        return (
                          <tr className={`border-b ${isOracleFailed ? "bg-gray-50" : "bg-rose-50"}`}>
                            <td colSpan={7} className="px-6 py-3">
                              <div className={`mb-2 flex items-center justify-between text-xs ${isOracleFailed ? "text-gray-600" : "text-rose-700"}`}>
                                <span>
                                  再复核报告 · {report.modelDisplay || report.model} · {new Date(report.reviewedAt).toLocaleString()}
                                  {isOracleFailed
                                    ? <span className="ml-2 font-semibold">⊘ Opus 无法验证</span>
                                    : <>
                                        <span className="mx-1">·</span>{report.passed}/{report.total} 通过
                                        {report.failed > 0 && <span className="ml-2 font-semibold">⚠ {report.failed} 个差异待人工审阅</span>}
                                      </>}
                                </span>
                                <button onClick={() => setExpandedReviewId(null)} className="text-gray-500 hover:underline">收起</button>
                              </div>
                              {isOracleFailed ? (
                                <div className="rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                                  <div className="mb-1 font-semibold">原因</div>
                                  <div className="whitespace-pre-wrap break-words">{report.reason || "未知"}</div>
                                  <p className="mt-2 text-gray-500">该题 Opus 多次无法给出通过样例的解法，未对测试点做任何判定，也未改动数据。可稍后重试再复核，或改用其他方式人工审阅。</p>
                                </div>
                              ) : report.issues.length === 0 ? (
                                <div className="text-sm text-green-700">✓ 全部测试点通过再复核</div>
                              ) : (
                                <div className="space-y-2">
                                  {report.issues.map((iss) => (
                                    <div key={iss.index} className="rounded border border-rose-200 bg-white p-2 text-xs">
                                      <div className="mb-1 flex items-center justify-between">
                                        <span className="font-mono text-rose-700">
                                          #{iss.index + 1} · {iss.status === "mismatch" ? "输出不一致" : "运行错误"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                                        <div>
                                          <div className="mb-0.5 text-gray-500">输入</div>
                                          <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-1.5">{iss.input}</pre>
                                        </div>
                                        <div>
                                          <div className="mb-0.5 text-gray-500">当前期望</div>
                                          <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-1.5">{iss.expectedOutput}</pre>
                                        </div>
                                        <div>
                                          <div className="mb-0.5 text-gray-500">Opus 输出</div>
                                          <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-rose-50 p-1.5">{iss.opusOutput}</pre>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  <p className="text-xs text-gray-500">如需修改测试点，请点击&ldquo;编辑&rdquo;手动处理。</p>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })()}
                      {expandedProblemId === p.id && (
                        <tr className="border-b bg-amber-50">
                          <td colSpan={7} className="px-6 py-3">
                            {!variantDetails[p.id] ? (
                              <span className="text-sm text-gray-400">加载中...</span>
                            ) : variantDetails[p.id].length === 0 ? (
                              <span className="text-sm text-gray-400">暂无变形题</span>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs text-gray-500">
                                    <th className="pb-1 pr-4">ID</th>
                                    <th className="pb-1 pr-4">标题</th>
                                    <th className="pb-1 pr-4">状态</th>
                                    <th className="pb-1 pr-4">测试点</th>
                                    <th className="pb-1 pr-4">再复核</th>
                                    <th className="pb-1">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {variantDetails[p.id].map((v) => {
                                    const vReport = parseReviewReport(v.reviewReport);
                                    return (
                                    <Fragment key={v.id}>
                                    <tr className="border-t border-amber-100">
                                      <td className="py-1 pr-4 font-mono text-gray-400">v{v.id}</td>
                                      <td className="py-1 pr-4 text-gray-800">{v.title}</td>
                                      <td className="py-1 pr-4">
                                        {v.genStatus === "ready"      && <span className="text-green-600">ready</span>}
                                        {v.genStatus === "generating" && <span className="text-yellow-600">生成中</span>}
                                        {v.genStatus === "failed"     && <span className="text-red-500" title={v.genError}>失败</span>}
                                        {v.genStatus === "pending"    && <span className="text-gray-400">等待</span>}
                                      </td>
                                      <td className="py-1 pr-4 text-gray-500">{v.verifiedCount ?? 0}</td>
                                      <td className="py-1 pr-4">
                                        {vReport ? (
                                          <button
                                            onClick={() => setExpandedVariantReviewId(expandedVariantReviewId === v.id ? null : v.id)}
                                            title={v.lastReviewedAt ? getTimeAgo(v.lastReviewedAt) : ""}
                                            className={`rounded px-1 text-xs ${
                                              vReport.status === "oracle_failed"
                                                ? "bg-gray-200 text-gray-600"
                                                : vReport.failed > 0
                                                  ? "bg-rose-100 text-rose-700"
                                                  : "bg-green-100 text-green-700"
                                            }`}
                                          >
                                            {vReport.status === "oracle_failed"
                                              ? "⊘ 无法验证"
                                              : vReport.failed > 0
                                                ? `⚠ ${vReport.failed}/${vReport.total}`
                                                : `✓ ${vReport.total}`}
                                          </button>
                                        ) : (
                                          <span className="text-gray-300 text-xs">-</span>
                                        )}
                                      </td>
                                      <td className="py-1 flex items-center gap-3">
                                        {v.genStatus === "ready" && (
                                          <a
                                            href={`/problems/v${v.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            预览
                                          </a>
                                        )}
                                        {v.genStatus === "ready" && (
                                          <button
                                            onClick={() => handleVariantReview(v.id, p.id)}
                                            disabled={variantReviewing !== null}
                                            title="Opus 4.7 再复核该变形题"
                                            className="text-rose-600 hover:underline text-xs disabled:opacity-50"
                                          >
                                            {variantReviewing === v.id ? "再复核中..." : "再复核"}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDeleteVariant(v.id, p.id)}
                                          className="text-red-500 hover:underline text-xs"
                                        >
                                          删除
                                        </button>
                                      </td>
                                    </tr>
                                    {expandedVariantReviewId === v.id && vReport && (() => {
                                      const isOracleFailed = vReport.status === "oracle_failed";
                                      return (
                                      <tr className={`border-t ${isOracleFailed ? "border-gray-200 bg-gray-50" : "border-rose-200 bg-rose-50"}`}>
                                        <td colSpan={6} className="px-3 py-2">
                                          <div className={`mb-2 flex items-center justify-between text-xs ${isOracleFailed ? "text-gray-600" : "text-rose-700"}`}>
                                            <span>
                                              v{v.id} 再复核 · {vReport.modelDisplay || vReport.model} · {new Date(vReport.reviewedAt).toLocaleString()}
                                              {isOracleFailed
                                                ? <span className="ml-2 font-semibold">⊘ Opus 无法验证</span>
                                                : <> · {vReport.passed}/{vReport.total} 通过</>}
                                            </span>
                                            <button onClick={() => setExpandedVariantReviewId(null)} className="text-gray-500 hover:underline">收起</button>
                                          </div>
                                          {isOracleFailed ? (
                                            <div className="rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                                              <div className="mb-1 font-semibold">原因</div>
                                              <div className="whitespace-pre-wrap break-words">{vReport.reason || "未知"}</div>
                                            </div>
                                          ) : vReport.issues.length === 0 ? (
                                            <div className="text-xs text-green-700">✓ 全部测试点通过再复核</div>
                                          ) : (
                                            <div className="space-y-2">
                                              {vReport.issues.map((iss) => (
                                                <div key={iss.index} className="rounded border border-rose-200 bg-white p-2 text-xs">
                                                  <div className="mb-1 font-mono text-rose-700">
                                                    #{iss.index + 1} · {iss.status === "mismatch" ? "输出不一致" : "运行错误"}
                                                  </div>
                                                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                                                    <div>
                                                      <div className="mb-0.5 text-gray-500">输入</div>
                                                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-1">{iss.input}</pre>
                                                    </div>
                                                    <div>
                                                      <div className="mb-0.5 text-gray-500">当前期望</div>
                                                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-1">{iss.expectedOutput}</pre>
                                                    </div>
                                                    <div>
                                                      <div className="mb-0.5 text-gray-500">Opus 输出</div>
                                                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-rose-50 p-1">{iss.opusOutput}</pre>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                      );
                                    })()}
                                    </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ===== 单题导入 ===== */}
        {tab === "single" && (
          <>
            <form onSubmit={handleSingleImport} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">洛谷题号</label>
                <input type="text" value={luoguId} onChange={(e) => setLuoguId(e.target.value)}
                  placeholder="例如 P10720 或 B3840"
                  className="w-full rounded-md border px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required />
              </div>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">GESP 级别</label>
                <LevelSelect value={importLevel} onChange={setImportLevel} />
              </div>
              <button type="submit" disabled={importLoading || !luoguId.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {importLoading ? "导入中..." : "导入题目"}
              </button>
            </form>

            {importResult && (
              <div className={`mt-4 rounded-lg p-4 text-sm ${importResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {importResult.message}
              </div>
            )}

            {importHistory.length > 0 && (
              <div className="mt-6 rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">本次导入</h2>
                <div className="space-y-2">
                  {importHistory.map((h) => (
                    <a key={h.id} href={`/problems/${h.id}`}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-blue-50">
                      <span><span className="mr-2 font-mono text-gray-400">{h.luoguId}</span>{h.title}</span>
                      <span className="text-blue-500">查看 &rarr;</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== 批量导入 ===== */}
        {tab === "batch" && (
          <>
            <form onSubmit={handleBatchImport} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">洛谷题目列表链接</label>
                <input type="url" value={batchUrl} onChange={(e) => setBatchUrl(e.target.value)}
                  placeholder="例如 https://www.luogu.com.cn/problem/list?tag=355&type=P"
                  className="w-full rounded-md border px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required />
                <p className="mt-2 text-xs text-gray-400">支持洛谷题目列表页链接，自动获取所有页并逐个导入，已存在的题目自动跳过。</p>
              </div>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">统一指定 GESP 级别</label>
                <LevelSelect value={batchLevel} onChange={setBatchLevel} />
              </div>
              <button type="submit" disabled={batchLoading || !batchUrl.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {batchLoading ? "批量导入中，请耐心等待..." : "开始批量导入"}
              </button>
            </form>

            {batchStatus && (
              <div className={`mt-4 rounded-lg p-4 text-sm ${batchSummary ? "bg-blue-50 text-blue-700" : batchLoading ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
                {batchStatus}
              </div>
            )}

            {batchSummary && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {([["总计", batchSummary.total, "text-gray-900"], ["成功", batchSummary.success, "text-green-600"], ["已存在", batchSummary.skipped, "text-gray-400"], ["失败", batchSummary.failed, "text-red-600"]] as const).map(([label, val, color]) => (
                  <div key={label} className="rounded-lg bg-white p-4 text-center shadow">
                    <div className={`text-2xl font-bold ${color}`}>{val}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
            )}

            {batchResults.length > 0 && (
              <div className="mt-4 rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">导入结果</h2>
                <div className="max-h-96 space-y-1 overflow-auto">
                  {batchResults.map((r) => (
                    <div key={r.luoguId} className="flex items-center justify-between rounded px-3 py-1.5 text-sm">
                      <span>
                        <span className="mr-2 font-mono text-gray-400">{r.luoguId}</span>
                        {r.status === "ok" ? (
                          <a href={`/problems/${r.id}`} className="text-gray-900 hover:text-blue-600">{r.title}</a>
                        ) : (<span className="text-red-500">{r.error}</span>)}
                      </span>
                      <span className={`text-xs ${r.status === "ok" ? "text-green-600" : "text-red-600"}`}>
                        {r.status === "ok" ? "成功" : "失败"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
