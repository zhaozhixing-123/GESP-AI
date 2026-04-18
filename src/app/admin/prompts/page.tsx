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

const DEFAULT_WRONGBOOK_ANALYSIS_PROMPT = `你是GESP.AI的错题复盘老师，帮助学生从错误中提炼出可复用的编程经验。

输出格式要求：
第一行必须是错误类型标签，格式为：【错误类型：xxx】
其中 xxx 从以下选项中选择最匹配的一个：
数组越界、逻辑错误、边界条件、整数溢出、死循环、输入输出错误、算法错误、变量未初始化、递归错误、其他

然后换行，按以下三个部分输出分析（使用 Markdown 格式）：

## 这道题错在哪
用 1-3 句话简洁说明本题代码的具体错误，可以引用代码片段。不展开讲，点到为止。

## 这类错误为什么容易犯
脱离这道具体的题，解释你判断的这类错误的**通用规律**：
- 它通常在什么编程场景下出现
- 为什么新手容易在这里踩坑（思维上的盲点是什么）
- 举 1 个与本题无关的简单例子说明

## 下次怎么避免
给出 2-4 条具体的**自检习惯**，像检查清单一样，适用于所有同类题目。
用「✓ 写完XX类代码后，检查……」的格式，让学生养成固定的思维动作。

写作要求：
- 语言简洁，适合小学到初中学生理解
- 重点在第二、三部分，帮助学生举一反三
- 不要给出本题的完整修改代码

当前题目信息：
- 标题：{{problem_title}}
- 描述：{{problem_description}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}

{{wrong_code_section}}`;

const DEFAULT_EXAM_REVIEW_PROMPT = `你是 GESP.AI 的模拟考试诊断老师。学生刚完成了一次模拟考试，请根据题目和学生提交的代码给出专业、鼓励性的诊断报告。

报告结构（使用 Markdown 格式）：

## 整体表现
简要评价学生的整体发挥：完成几道题、时间使用情况、整体代码质量印象（2-3句）。

## 逐题点评
对每道题分别点评：
- 代码思路是否正确
- 主要问题（如有，具体指出）
- 一条改进建议

## 知识盲区诊断
从所有错误中归纳出 2-3 个需要重点加强的知识点，说明为什么。

## 下一步学习计划
给出 3 条具体可行的建议，帮助学生有针对性地提升。

写作要求：
- 鼓励为主，先肯定优点再指出问题
- 语言适合小学到初中学生
- 不要给出完整的修改代码`;

const DEFAULT_PROBLEM_AUTOTAG_PROMPT = `你是一个 GESP C++ 算法题分类助手。从以下标签中为题目选出最匹配的 1-3 个，优先选最核心的考察点。
只输出一个 JSON 字符串数组，不要任何解释、标点或其他内容，例如：["动态规划"] 或 ["DFS","树"]。
可用标签：{{gesp_tags}}`;

const DEFAULT_TESTGEN_SOLUTIONS_PROMPT = `你是算法竞赛出题人。请根据题目写两个独立的 C++ 解法。

## 题目信息
{{problem_context}}

## 重要：先验证样例
在写代码之前，请先仔细阅读每个样例，手动推演一遍输入到输出的完整过程。
特别注意：边界条件（是否包含端点）、计数方式（从0还是从1）、四舍五入规则等。
你的代码必须在这些样例上产生完全一致的输出。

## 任务
写两个完全独立的 C++ 解法，每个都能正确解决这道题。

### solution1（暴力法）
- 用最简单、最直接的方式
- 不追求效率，只追求正确性

### solution2（不同思路）
- 用与 solution1 不同的算法思路
- 同样必须正确

请调用 submit_solutions 工具提交你的两个解法。`;

const DEFAULT_TESTGEN_INPUTS_PROMPT = `你是算法竞赛出题人。请根据题目生成 15 组测试输入数据。

## 题目信息
{{problem_context}}

## 要求
严格遵守题目的数据范围，生成以下类型的测试输入：
- 2-3 组最小边界（最小的 n、最小值等）
- 2-3 组最大边界
- 2-3 组特殊情况（全是同一个数、全是0、全是最大值等）
- 5-7 组随机中等规模数据

只需要输入数据，不需要输出。

## 重要：控制每组输入的长度
- 如果 n 代表数组长度/行数等，最大边界的 n 不要超过 100
- 中等规模数据的 n 取 10-50
- 每组输入要简洁，不要生成过长的数据

请调用 submit_inputs 工具提交测试输入。`;

const DEFAULT_TESTVERIFY_SOLUTION_PROMPT = `请根据以下题目写一个正确的 C++ 解法。

## 题目信息
**标题**: {{title}}
**描述**: {{description}}
**输入格式**: {{input_format}}
**输出格式**: {{output_format}}
{{sample_text}}

## 重要：先验证样例
在写代码之前，请先仔细阅读每个样例，手动推演一遍输入到输出的完整过程。
特别注意：边界条件（是否包含端点）、计数方式（从0还是从1）、四舍五入规则等。

## 要求
- 写一个完全正确的 C++ 程序，读 stdin 写 stdout
- 确保逻辑严谨，处理所有边界情况

请调用 submit_solution 工具提交你的解法。`;

const DEFAULT_VARIANTGEN_PROBLEM_PROMPT = `你是一名 GESP 算法竞赛出题人，请根据下面的原题，设计一道"变形题"。

## 原题信息
{{source_context}}
{{avoid_section}}
## 变形题要求
1. **保持相同的算法思路和知识点**，但改变题目的情境、故事背景、变量名称，以及部分数值参数
2. 难度和 GESP 级别保持不变（{{level}} 级）
3. 提供 2~3 组样例输入（sampleInputs），**不需要提供输出**，输出由程序自动计算
4. 输入输出格式可以调整，但整体复杂度相近
5. 题目描述完整，不能引用原题，不能出现"原题"等字眼

请调用 submit_variant 工具提交你的变形题。`;

const DEFAULT_VARIANTGEN_SOLUTION_PROMPT = `请根据以下题目写一个完整正确的 C++ 解法。

## 题目
**标题**: {{title}}
**描述**: {{description}}
**输入格式**: {{input_format}}
**输出格式**: {{output_format}}

请调用 submit_solution 工具提交代码。`;

const DEFAULT_VARIANTVERIFY_SOLUTION_PROMPT = `请根据以下题目写一个完整正确的 C++ 解法。

## 题目信息
**标题**: {{title}}
**描述**: {{description}}
**输入格式**: {{input_format}}
**输出格式**: {{output_format}}
{{sample_text}}

## 重要
- 先仔细阅读每个样例，手动推演一遍
- 特别注意边界条件、计数方式、四舍五入规则
- 你的代码必须在所有样例上产生完全一致的输出

请调用 submit_solution 工具提交你的解法。`;

interface CategoryDef {
  value: string;
  label: string;
  group: "student" | "admin";
  defaultName: string;
  defaultContent: string;
  defaultVariables: string[];
  description: string;
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    value: "system",
    label: "AI 老师提示词",
    group: "student",
    defaultName: "AI老师系统提示词",
    defaultContent: DEFAULT_SYSTEM_PROMPT,
    defaultVariables: ["problem_title", "problem_description", "input_format", "output_format", "user_code_section"],
    description: "学生在题目页与 AI 老师对话时使用的 system prompt",
  },
  {
    value: "wrongbook_analysis",
    label: "错题分析提示词",
    group: "student",
    defaultName: "错题分析提示词",
    defaultContent: DEFAULT_WRONGBOOK_ANALYSIS_PROMPT,
    defaultVariables: ["problem_title", "problem_description", "input_format", "output_format", "wrong_code_section", "submission_status_label", "status_specific_hint"],
    description: "学生在错题本查看错题分析时使用的提示词",
  },
  {
    value: "exam_review",
    label: "模拟考诊断提示词",
    group: "student",
    defaultName: "模拟考诊断提示词",
    defaultContent: DEFAULT_EXAM_REVIEW_PROMPT,
    defaultVariables: [],
    description: "学生完成模拟考试后生成诊断报告使用",
  },
  {
    value: "problem_autotag",
    label: "题目自动打标",
    group: "admin",
    defaultName: "题目自动打标提示词",
    defaultContent: DEFAULT_PROBLEM_AUTOTAG_PROMPT,
    defaultVariables: ["gesp_tags"],
    description: "管理员「一键打标」调用 Claude 为题目选择 GESP 知识点标签",
  },
  {
    value: "testgen_solutions",
    label: "测试数据生成 - 双解法",
    group: "admin",
    defaultName: "测试数据-双解法生成",
    defaultContent: DEFAULT_TESTGEN_SOLUTIONS_PROMPT,
    defaultVariables: ["problem_context"],
    description: "生成测试数据时让 Claude 写两个独立 C++ 解法交叉验证",
  },
  {
    value: "testgen_inputs",
    label: "测试数据生成 - 输入数据",
    group: "admin",
    defaultName: "测试数据-输入生成",
    defaultContent: DEFAULT_TESTGEN_INPUTS_PROMPT,
    defaultVariables: ["problem_context"],
    description: "生成测试数据时让 Claude 输出 15 组测试输入",
  },
  {
    value: "testverify_solution",
    label: "测试数据复核 - 解法",
    group: "admin",
    defaultName: "测试数据复核-Opus 解法",
    defaultContent: DEFAULT_TESTVERIFY_SOLUTION_PROMPT,
    defaultVariables: ["title", "description", "input_format", "output_format", "sample_text"],
    description: "复核测试数据时让 Opus 写一个正确解法",
  },
  {
    value: "variantgen_problem",
    label: "变形题生成 - 题面",
    group: "admin",
    defaultName: "变形题-题面生成",
    defaultContent: DEFAULT_VARIANTGEN_PROBLEM_PROMPT,
    defaultVariables: ["source_context", "avoid_section", "level"],
    description: "生成变形题时让 Claude 根据原题改编题面",
  },
  {
    value: "variantgen_solution",
    label: "变形题生成 - 样例解法",
    group: "admin",
    defaultName: "变形题-样例解法",
    defaultContent: DEFAULT_VARIANTGEN_SOLUTION_PROMPT,
    defaultVariables: ["title", "description", "input_format", "output_format"],
    description: "生成变形题时让 Claude 写解法以计算样例输出",
  },
  {
    value: "variantverify_solution",
    label: "变形题复核 - 解法",
    group: "admin",
    defaultName: "变形题复核-Opus 解法",
    defaultContent: DEFAULT_VARIANTVERIFY_SOLUTION_PROMPT,
    defaultVariables: ["title", "description", "input_format", "output_format", "sample_text"],
    description: "复核变形题时让 Opus 写解法验证样例和测试点",
  },
];

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "system", content: "", variables: "[]" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDefaults, setShowDefaults] = useState(false);

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

  function importDefault(def: CategoryDef) {
    setEditing(null);
    setForm({
      name: def.defaultName,
      category: def.value,
      content: def.defaultContent,
      variables: JSON.stringify(def.defaultVariables),
    });
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

  const defaultsToShow = CATEGORY_DEFS.filter((def) => !prompts.some((p) => p.category === def.value));

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

        <div className="mb-4 space-y-1 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          <div className="font-medium">支持的变量（按分类）：</div>
          <div>· AI 老师 / 错题分析：{`{{problem_title}}`}、{`{{problem_description}}`}、{`{{input_format}}`}、{`{{output_format}}`}、{`{{user_code_section}}`}、{`{{wrong_code_section}}`}、{`{{submission_status_label}}`}、{`{{status_specific_hint}}`}</div>
          <div>· 模拟考诊断：无变量（题目/代码通过用户消息传入）</div>
          <div>· 题目自动打标：{`{{gesp_tags}}`}</div>
          <div>· 测试数据生成：{`{{problem_context}}`}</div>
          <div>· 测试/变形题复核、变形题样例解法：{`{{title}}`}、{`{{description}}`}、{`{{input_format}}`}、{`{{output_format}}`}、{`{{sample_text}}`}</div>
          <div>· 变形题题面生成：{`{{source_context}}`}、{`{{avoid_section}}`}、{`{{level}}`}</div>
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
                    {CATEGORY_DEFS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
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

        {!loading && defaultsToShow.length > 0 && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setShowDefaults((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">内置默认提示词</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {defaultsToShow.length} 个未配置
                </span>
              </div>
              <span className="text-sm text-gray-400">{showDefaults ? "收起 ▲" : "展开 ▼"}</span>
            </button>

            {showDefaults && (
              <div className="space-y-4 border-t border-gray-100 p-5">
                <p className="text-xs text-gray-500">
                  以下分类未在数据库中配置自定义提示词，系统正在使用内置默认值。点击「导入为可编辑」可将默认内容载入表单并保存到数据库。
                </p>
                {defaultsToShow.map((def) => (
                  <div key={def.value} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{def.label}</span>
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          def.group === "student" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {def.group === "student" ? "学生端" : "管理端"}
                        </span>
                      </div>
                      <button
                        onClick={() => importDefault(def)}
                        className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                      >
                        导入为可编辑
                      </button>
                    </div>
                    <p className="mb-2 text-xs text-gray-500">{def.description}</p>
                    <pre className="max-h-40 overflow-auto rounded bg-white p-3 text-xs font-mono text-gray-600 border border-gray-200">
                      {def.defaultContent}
                    </pre>
                  </div>
                ))}
              </div>
            )}
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
                      {CATEGORY_DEFS.find((c) => c.value === p.category)?.label || p.category}
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
