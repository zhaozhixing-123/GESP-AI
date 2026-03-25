"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface Prompt {
  id: number;
  name: string;
  category: string;
  content: string;
  variables: string;
}

const CATEGORIES = [
  { value: "system", label: "系统提示词" },
  { value: "hint", label: "思路提示" },
  { value: "error_analysis", label: "错误分析" },
  { value: "step_guide", label: "分步引导" },
];

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "system", content: "", variables: "[]" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function fetchPrompts() {
    setLoading(true);
    const res = await fetch("/api/admin/prompts", { headers });
    if (res.ok) { const data = await res.json(); setPrompts(data.prompts); }
    setLoading(false);
  }

  useEffect(() => { fetchPrompts(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", category: "system", content: "", variables: "[]" });
    setShowForm(true);
    setError("");
  }

  function openEdit(p: Prompt) {
    setEditing(p);
    setForm({ name: p.name, category: p.category, content: p.content, variables: p.variables });
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const url = editing ? `/api/admin/prompts/${editing.id}` : "/api/admin/prompts";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
    if (res.ok) { setShowForm(false); fetchPrompts(); }
    else { const data = await res.json(); setError(data.error || "操作失败"); }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/admin/prompts/${id}`, { method: "DELETE", headers });
    fetchPrompts();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">提示词管理</h1>
          <button onClick={openNew}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            添加提示词
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          支持变量占位符：{`{{problem_title}}`}、{`{{problem_description}}`}、{`{{input_format}}`}、{`{{output_format}}`}、{`{{user_code_section}}`}
        </div>

        {showForm && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">{editing ? "编辑提示词" : "添加提示词"}</h2>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">名称</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">分类</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm">
                    {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">内容</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={12} required />
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

        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : prompts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">暂无提示词，AI 老师将使用默认提示词</div>
        ) : (
          <div className="space-y-4">
            {prompts.map((p) => (
              <div key={p.id} className="rounded-lg bg-white p-5 shadow">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {CATEGORIES.find((c) => c.value === p.category)?.label || p.category}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="text-sm text-blue-600 hover:underline">编辑</button>
                    <button onClick={() => handleDelete(p.id)} className="text-sm text-red-600 hover:underline">删除</button>
                  </div>
                </div>
                <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-3 text-xs font-mono text-gray-600">
                  {p.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
