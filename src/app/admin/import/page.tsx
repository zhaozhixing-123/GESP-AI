"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

interface ImportResult {
  luoguId: string;
  title: string;
  id: number;
  status: "ok" | "error";
  error?: string;
}

export default function AdminImportPage() {
  const [tab, setTab] = useState<"single" | "batch">("single");

  // 单题
  const [luoguId, setLuoguId] = useState("");
  const [level, setLevel] = useState("0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<Array<{ luoguId: string; title: string; id: number }>>([]);

  // 批量
  const [batchUrl, setBatchUrl] = useState("");
  const [batchLevel, setBatchLevel] = useState("0");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchResults, setBatchResults] = useState<ImportResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<{ total: number; success: number; failed: number; skipped: number } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function handleSingleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!luoguId.trim() || loading) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          luoguId: luoguId.trim().toUpperCase(),
          level: level !== "0" ? parseInt(level) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: `${data.problem.title} 导入成功` });
        setHistory((prev) => [{ luoguId: data.problem.luoguId, title: data.problem.title, id: data.problem.id }, ...prev]);
        setLuoguId("");
      } else {
        setResult({ success: false, message: data.error || "导入失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    }
    setLoading(false);
  }

  async function handleBatchImport(e: React.FormEvent) {
    e.preventDefault();
    if (!batchUrl.trim() || batchLoading) return;
    setBatchLoading(true);
    setBatchStatus("正在从洛谷获取题目列表并逐个导入，请耐心等待...");
    setBatchResults([]);
    setBatchSummary(null);

    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          luoguUrl: batchUrl.trim(),
          level: batchLevel !== "0" ? parseInt(batchLevel) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBatchStatus(data.message);
        setBatchResults(data.results || []);
        setBatchSummary({ total: data.total, success: data.success, failed: data.failed, skipped: data.skipped });
      } else {
        setBatchStatus(data.error || "导入失败");
      }
    } catch {
      setBatchStatus("网络错误");
    }
    setBatchLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">导入题目</h1>

        {/* Tab 切换 */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setTab("single")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "single" ? "bg-white text-gray-900 shadow" : "text-gray-500"
            }`}
          >
            单题导入
          </button>
          <button
            onClick={() => setTab("batch")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "batch" ? "bg-white text-gray-900 shadow" : "text-gray-500"
            }`}
          >
            批量导入
          </button>
        </div>

        {/* 单题导入 */}
        {tab === "single" && (
          <>
            <form onSubmit={handleSingleImport} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">洛谷题号</label>
                <input
                  type="text"
                  value={luoguId}
                  onChange={(e) => setLuoguId(e.target.value)}
                  placeholder="例如 P10720 或 B3840"
                  className="w-full rounded-md border px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">GESP 级别</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full rounded-md border px-4 py-2.5 text-sm"
                >
                  <option value="0">自动识别</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                    <option key={l} value={l}>{l}级</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading || !luoguId.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "导入中..." : "导入题目"}
              </button>
            </form>

            {result && (
              <div className={`mt-4 rounded-lg p-4 text-sm ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {result.message}
              </div>
            )}

            {history.length > 0 && (
              <div className="mt-6 rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">本次导入</h2>
                <div className="space-y-2">
                  {history.map((h) => (
                    <a key={h.id} href={`/problems/${h.id}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-blue-50">
                      <span>
                        <span className="mr-2 font-mono text-gray-400">{h.luoguId}</span>
                        {h.title}
                      </span>
                      <span className="text-blue-500">查看 &rarr;</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 批量导入 */}
        {tab === "batch" && (
          <>
            <form onSubmit={handleBatchImport} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">洛谷题目列表链接</label>
                <input
                  type="url"
                  value={batchUrl}
                  onChange={(e) => setBatchUrl(e.target.value)}
                  placeholder="例如 https://www.luogu.com.cn/problem/list?tag=355&type=P"
                  className="w-full rounded-md border px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
                <p className="mt-2 text-xs text-gray-400">
                  支持洛谷题目列表页链接，会自动获取所有页的题目并逐个导入。已存在的题目会自动跳过。
                </p>
              </div>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">统一指定 GESP 级别</label>
                <select
                  value={batchLevel}
                  onChange={(e) => setBatchLevel(e.target.value)}
                  className="w-full rounded-md border px-4 py-2.5 text-sm"
                >
                  <option value="0">自动识别（从标题提取）</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                    <option key={l} value={l}>全部设为 {l}级</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={batchLoading || !batchUrl.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {batchLoading ? "批量导入中，请耐心等待..." : "开始批量导入"}
              </button>
            </form>

            {/* 状态 */}
            {batchStatus && (
              <div className={`mt-4 rounded-lg p-4 text-sm ${batchSummary ? "bg-blue-50 text-blue-700" : batchLoading ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
                {batchStatus}
              </div>
            )}

            {/* 统计 */}
            {batchSummary && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-white p-4 text-center shadow">
                  <div className="text-2xl font-bold text-gray-900">{batchSummary.total}</div>
                  <div className="text-xs text-gray-500">总计</div>
                </div>
                <div className="rounded-lg bg-white p-4 text-center shadow">
                  <div className="text-2xl font-bold text-green-600">{batchSummary.success}</div>
                  <div className="text-xs text-gray-500">成功</div>
                </div>
                <div className="rounded-lg bg-white p-4 text-center shadow">
                  <div className="text-2xl font-bold text-gray-400">{batchSummary.skipped}</div>
                  <div className="text-xs text-gray-500">已存在</div>
                </div>
                <div className="rounded-lg bg-white p-4 text-center shadow">
                  <div className="text-2xl font-bold text-red-600">{batchSummary.failed}</div>
                  <div className="text-xs text-gray-500">失败</div>
                </div>
              </div>
            )}

            {/* 结果列表 */}
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
                        ) : (
                          <span className="text-red-500">{r.error}</span>
                        )}
                      </span>
                      {r.status === "ok" ? (
                        <span className="text-xs text-green-600">成功</span>
                      ) : (
                        <span className="text-xs text-red-600">失败</span>
                      )}
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
