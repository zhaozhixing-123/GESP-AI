"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
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

  // --- 题目列表逻辑 ---
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

  async function handleGenerate(id: number) {
    if (generating) return;
    setGenerating(id);
    setGenMsg("正在生成测试数据（约1-2分钟）...");
    try {
      const res = await fetch(`/api/admin/problems/${id}/generate`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setGenMsg(`${data.message}`);
      } else {
        setGenMsg(`失败: ${data.error}`);
      }
    } catch {
      setGenMsg("网络错误");
    }
    setGenerating(null);
    setTimeout(() => setGenMsg(""), 5000);
  }

  async function handleClearAll() {
    if (!confirm("确定清空所有题目？此操作会同时删除所有提交记录、错题本和聊天记录，不可恢复！")) return;
    if (!confirm("再次确认：真的要删除全部题目吗？")) return;
    const res = await fetch("/api/admin/problems/clear", { method: "DELETE", headers });
    const data = await res.json();
    if (res.ok) { alert(data.message); fetchProblems(); }
    else { alert(data.error || "清空失败"); }
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
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">共 {problems.length} 道题</span>
              <div className="flex gap-2">
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
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.luoguId}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{p.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{p.level}级</td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleGenerate(p.id)}
                            disabled={generating !== null}
                            className="mr-2 text-green-600 hover:underline disabled:opacity-50"
                          >
                            {generating === p.id ? "生成中..." : "生成测试"}
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
