"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
}

export default function AdminProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Problem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    luoguId: "",
    title: "",
    level: "1",
    description: "",
    inputFormat: "",
    outputFormat: "",
    samples: "[]",
    testCases: "[]",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function fetchProblems() {
    setLoading(true);
    const res = await fetch("/api/admin/problems", { headers });
    if (res.ok) {
      const data = await res.json();
      setProblems(data.problems);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchProblems();
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ luoguId: "", title: "", level: "1", description: "", inputFormat: "", outputFormat: "", samples: "[]", testCases: "[]" });
    setShowForm(true);
    setError("");
  }

  async function openEdit(id: number) {
    const res = await fetch(`/api/admin/problems`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const p = data.problems.find((x: any) => x.id === id);
    if (!p) return;
    setEditing(p);
    setForm({
      luoguId: p.luoguId,
      title: p.title,
      level: String(p.level),
      description: p.description,
      inputFormat: p.inputFormat,
      outputFormat: p.outputFormat,
      samples: p.samples,
      testCases: p.testCases,
    });
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const url = editing ? `/api/admin/problems/${editing.id}` : "/api/admin/problems";
    const method = editing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify({ ...form, level: parseInt(form.level) }),
    });

    if (res.ok) {
      setShowForm(false);
      fetchProblems();
    } else {
      const data = await res.json();
      setError(data.error || "操作失败");
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除这道题目？")) return;
    await fetch(`/api/admin/problems/${id}`, { method: "DELETE", headers });
    fetchProblems();
  }

  async function handleClearAll() {
    if (!confirm("确定清空所有题目？此操作会同时删除所有提交记录、错题本和聊天记录，不可恢复！")) return;
    if (!confirm("再次确认：真的要删除全部题目吗？")) return;
    const res = await fetch("/api/admin/problems/clear", { method: "DELETE", headers });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchProblems();
    } else {
      alert(data.error || "清空失败");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">题目管理</h1>
          <div className="flex gap-2">
            <button
              onClick={handleClearAll}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              清空所有题目
            </button>
            <button
              onClick={openNew}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              添加题目
            </button>
          </div>
        </div>

        {/* 表单弹窗 */}
        {showForm && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? "编辑题目" : "添加题目"}
            </h2>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">洛谷ID</label>
                  <input
                    value={form.luoguId}
                    onChange={(e) => setForm({ ...form, luoguId: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    required
                    disabled={!!editing}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">标题</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">级别</label>
                  <select
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                      <option key={l} value={l}>{l}级</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">题目描述</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={5}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">输入格式</label>
                  <textarea
                    value={form.inputFormat}
                    onChange={(e) => setForm({ ...form, inputFormat: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">输出格式</label>
                  <textarea
                    value={form.outputFormat}
                    onChange={(e) => setForm({ ...form, outputFormat: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">样例 (JSON)</label>
                  <textarea
                    value={form.samples}
                    onChange={(e) => setForm({ ...form, samples: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">测试数据 (JSON)</label>
                  <textarea
                    value={form.testCases}
                    onChange={(e) => setForm({ ...form, testCases: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 题目列表 */}
        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">洛谷ID</th>
                  <th className="px-4 py-3 font-medium">标题</th>
                  <th className="px-4 py-3 font-medium">级别</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 text-sm text-gray-500">{p.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{p.luoguId}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.level}级</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => openEdit(p.id)}
                        className="mr-2 text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:underline"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-gray-400">
          共 {problems.length} 道题
        </p>
      </main>
    </div>
  );
}
