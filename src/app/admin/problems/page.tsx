"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  testCases?: string;
  verifiedAt?: string | null;
  verifiedCount?: number;
}

interface ImportResult {
  luoguId: string;
  title: string;
  id: number;
  status: "ok" | "error";
  error?: string;
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
    const res = await fetch("/api/admin/problems", { headers });
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

  // --- 复核测试数据 ---
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [batchVerifyLevel, setBatchVerifyLevel] = useState("0");
  const [batchVerifyRunning, setBatchVerifyRunning] = useState(false);
  const [batchVerifyProgress, setBatchVerifyProgress] = useState("");
  const [batchVerifyResults, setBatchVerifyResults] = useState<Array<{ title: string; ok: boolean; msg: string }>>([]);

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
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProblems.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
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
                            if (!p.verifiedAt) return <span className="text-gray-400">未复核</span>;
                            const vc = p.verifiedCount ?? 0;
                            const allPassed = vc === tcCount;
                            const timeAgo = getTimeAgo(p.verifiedAt);
                            return allPassed
                              ? <span className="text-green-600" title={timeAgo}>{vc}/{tcCount} &#10003;</span>
                              : <span className="text-amber-600" title={timeAgo}>{vc}/{tcCount} &#9888;</span>;
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
                          <button onClick={() => openEdit(p.id)} className="mr-2 text-blue-600 hover:underline">编辑</button>
                          <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">删除</button>
                        </td>
                      </tr>
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
