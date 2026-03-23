"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

interface Problem {
  id: number;
  luoguId: string;
  title: string;
  level: number;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
}

interface Sample {
  input: string;
  output: string;
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

export default function ProblemDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProblem() {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/problems/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProblem(await res.json());
      }
      setLoading(false);
    }
    fetchProblem();
  }, [id]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="text-gray-500">加载中...</div>
        </main>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="text-gray-500">题目不存在</div>
        </main>
      </div>
    );
  }

  const samples: Sample[] = JSON.parse(problem.samples || "[]");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          &larr; 返回题目列表
        </button>

        {/* 标题 */}
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{problem.title}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              LEVEL_COLORS[problem.level] || "bg-gray-100 text-gray-600"
            }`}
          >
            {problem.level}级
          </span>
          <span className="text-sm text-gray-400 font-mono">{problem.luoguId}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左侧：题目信息 */}
          <div className="space-y-6">
            {/* 题目描述 */}
            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">题目描述</h2>
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                {problem.description}
              </div>
            </section>

            {/* 输入格式 */}
            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">输入格式</h2>
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                {problem.inputFormat}
              </div>
            </section>

            {/* 输出格式 */}
            <section className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">输出格式</h2>
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                {problem.outputFormat}
              </div>
            </section>

            {/* 样例 */}
            {samples.map((sample, i) => (
              <section key={i} className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">
                  样例 {samples.length > 1 ? i + 1 : ""}
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <pre className="rounded bg-gray-50 p-3 text-sm font-mono text-gray-800">
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
                    <pre className="rounded bg-gray-50 p-3 text-sm font-mono text-gray-800">
                      {sample.output}
                    </pre>
                  </div>
                </div>
              </section>
            ))}
          </div>

          {/* 右侧：代码编辑器占位 */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">代码编辑器</h2>
            <div className="flex h-64 items-center justify-center rounded border-2 border-dashed border-gray-200 text-gray-400">
              代码编辑器将在第三阶段上线
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
