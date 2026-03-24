"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function AdminImportPage() {
  const [luoguId, setLuoguId] = useState("");
  const [level, setLevel] = useState("0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<Array<{ luoguId: string; title: string; id: number }>>([]);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!luoguId.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          luoguId: luoguId.trim().toUpperCase(),
          level: level !== "0" ? parseInt(level) : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: `${data.problem.title} 导入成功 (ID: ${data.problem.id})` });
        setHistory((prev) => [
          { luoguId: data.problem.luoguId, title: data.problem.title, id: data.problem.id },
          ...prev,
        ]);
        setLuoguId("");
      } else {
        setResult({ success: false, message: data.error || "导入失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误，请重试" });
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">从洛谷导入题目</h1>

        <form onSubmit={handleImport} className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              洛谷题号
            </label>
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
            <label className="mb-2 block text-sm font-medium text-gray-700">
              GESP 级别（留空自动识别）
            </label>
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
            {loading ? "导入中，请稍候..." : "导入题目"}
          </button>
        </form>

        {/* 结果提示 */}
        {result && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              result.success
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {result.message}
          </div>
        )}

        {/* 导入历史 */}
        {history.length > 0 && (
          <div className="mt-6 rounded-lg bg-white p-6 shadow">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">本次导入</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <a
                  key={h.id}
                  href={`/problems/${h.id}`}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-blue-50"
                >
                  <span>
                    <span className="font-mono text-gray-400 mr-2">{h.luoguId}</span>
                    {h.title}
                  </span>
                  <span className="text-blue-500">查看 &rarr;</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
