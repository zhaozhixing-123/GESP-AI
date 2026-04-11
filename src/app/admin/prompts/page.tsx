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
  { value: "system", label: "AI老师提示词" },
  { value: "wrongbook_analysis", label: "错题分析提示词" },
  { value: "hint", label: "思路提示" },
  { value: "error_analysis", label: "错误分析" },
  { value: "step_guide", label: "分步引导" },
];

const DEFAULT_WRONGBOOK_ANALYSIS_PROMPT = `你是GESP.AI的错题分析助手，专门帮助学生找出代码中的具体错误。

任务：仔细分析学生提交的代码，找出导致答案错误的具体问题。

输出格式要求：
第一行必须是错误类型标签，格式为：【错误类型：xxx】
其中 xxx 从以下选项中选择最匹配的一个：
数组越界、逻辑错误、边界条件、整数溢出、死循环、输入输出错误、算法错误、变量未初始化、递归错误、其他

然后换行，进行详细分析。

分析规则：
1. 直接指出代码中的错误位置（引用具体代码片段）
2. 解释这样写为什么会出错，以及会导致什么错误结果
3. 给出修改思路和方向，但不直接给出完整修改后的代码
4. 如果有多处错误，按重要程度排序列出
5. 语言简洁，适合小学到初中学生理解

当前题目信息：
- 标题：{{problem_title}}
- 描述：{{problem_description}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}

{{wrong_code_section}}`;

const DEFAULT_SYSTEM_PROMPT = `你是GESP.AI的AI编程老师，帮助学生学习C++和GESP考试。

核心规则：
1. 绝对不能给出完整的解题代码
2. 绝对不能直接说出最终答案
3. 用引导式提问帮助学生自己想出解法
4. 可以解释概念、给思路方向、指出代码错误
5. 语言简洁，适合小学到初中学生理解
6. 如果学生直接要答案，温和地拒绝并引导他思考

当前题目信息：
- 标题：{{problem_title}}
- 描述：{{problem_description}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}

{{user_code_section}}`;

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
          AI老师变量：{`{{problem_title}}`}、{`{{problem_description}}`}、{`{{input_format}}`}、{`{{output_format}}`}、{`{{user_code_section}}`}
          &nbsp;·&nbsp;错题分析额外支持：{`{{wrong_code_section}}`}
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

        {/* 默认提示词提示：当没有 system 类别提示词时显示 */}
        {!loading && !prompts.some((p) => p.category === "system") && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-amber-800">AI 老师默认提示词</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-600">内置</span>
              </div>
              <button
                onClick={() => {
                  setEditing(null);
                  setForm({
                    name: "AI老师系统提示词",
                    category: "system",
                    content: DEFAULT_SYSTEM_PROMPT,
                    variables: JSON.stringify(["problem_title", "problem_description", "input_format", "output_format", "user_code_section"]),
                  });
                  setShowForm(true);
                  setError("");
                }}
                className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-200"
              >
                导入为可编辑
              </button>
            </div>
            <p className="mb-2 text-xs text-amber-600">当前未在数据库中配置系统提示词，AI 老师正在使用以下内置默认提示词：</p>
            <pre className="max-h-48 overflow-auto rounded bg-white p-3 text-xs font-mono text-gray-600 border border-amber-100">
              {DEFAULT_SYSTEM_PROMPT}
            </pre>
          </div>
        )}

        {/* 错题分析默认提示词：当没有 wrongbook_analysis 提示词时显示 */}
        {!loading && !prompts.some((p) => p.category === "wrongbook_analysis") && (
          <div className="mb-6 rounded-lg bg-purple-50 border border-purple-200 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-purple-800">错题分析默认提示词</span>
                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-600">内置</span>
              </div>
              <button
                onClick={() => {
                  setEditing(null);
                  setForm({
                    name: "错题分析提示词",
                    category: "wrongbook_analysis",
                    content: DEFAULT_WRONGBOOK_ANALYSIS_PROMPT,
                    variables: JSON.stringify(["problem_title", "problem_description", "input_format", "output_format", "wrong_code_section"]),
                  });
                  setShowForm(true);
                  setError("");
                }}
                className="rounded-md border border-purple-300 bg-purple-100 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-200"
              >
                导入为可编辑
              </button>
            </div>
            <p className="mb-2 text-xs text-purple-600">当前未配置错题分析提示词，错题本正在使用以下内置默认提示词：</p>
            <pre className="max-h-48 overflow-auto rounded bg-white p-3 text-xs font-mono text-gray-600 border border-purple-100">
              {DEFAULT_WRONGBOOK_ANALYSIS_PROMPT}
            </pre>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : prompts.length === 0 ? (
          <div className="py-8 text-center text-gray-400">暂无自定义提示词</div>
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
