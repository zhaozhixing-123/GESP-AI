"use client";

import { useEffect, useState } from "react";
import { STATUS_COLORS, STATUS_TEXT } from "@/lib/submission-status";

interface SubmissionDetail {
  id: number;
  code: string;
  status: string;
  timeUsed: number | null;
  memoryUsed: number | null;
  createdAt: string;
}

interface Props {
  newId: number;
  oldId: number;
  variant: boolean;
  onClose: () => void;
}

type DiffLine = { type: "same" | "del" | "add"; text: string };

/** LCS 行级 diff：插入删除也能正确对齐，比位置对齐更可读 */
function lcsLineDiff(a: string[], b: string[]): DiffLine[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < m) out.push({ type: "del", text: a[i++] });
  while (j < n) out.push({ type: "add", text: b[j++] });
  return out;
}

function fmtTime(s: string) {
  return new Date(s).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function SubmissionDiffModal({ newId, oldId, variant, onClose }: Props) {
  const [oldSub, setOldSub] = useState<SubmissionDetail | null>(null);
  const [newSub, setNewSub] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const base = variant ? "/api/variants/submissions" : "/api/submissions";

    Promise.all([
      fetch(`${base}/${oldId}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then((r) => r.json()),
      fetch(`${base}/${newId}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([o, n]) => {
        if (controller.signal.aborted) return;
        if (o.error || n.error) { setError(o.error || n.error); return; }
        setOldSub(o);
        setNewSub(n);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError("加载失败");
      });

    return () => controller.abort();
  }, [oldId, newId, variant]);

  const diff = oldSub && newSub
    ? lcsLineDiff(oldSub.code.split("\n"), newSub.code.split("\n"))
    : null;

  const sameCount = diff?.filter((d) => d.type === "same").length ?? 0;
  const delCount  = diff?.filter((d) => d.type === "del").length ?? 0;
  const addCount  = diff?.filter((d) => d.type === "add").length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">代码对比</h3>
            {oldSub && newSub && (
              <>
                <span className="text-xs text-gray-500">
                  旧：
                  <span className={`ml-1 font-bold ${STATUS_COLORS[oldSub.status] || "text-gray-600"}`}>
                    {STATUS_TEXT[oldSub.status] || oldSub.status}
                  </span>
                  <span className="ml-1 text-gray-400">{fmtTime(oldSub.createdAt)}</span>
                </span>
                <span className="text-gray-300">→</span>
                <span className="text-xs text-gray-500">
                  新：
                  <span className={`ml-1 font-bold ${STATUS_COLORS[newSub.status] || "text-gray-600"}`}>
                    {STATUS_TEXT[newSub.status] || newSub.status}
                  </span>
                  <span className="ml-1 text-gray-400">{fmtTime(newSub.createdAt)}</span>
                </span>
                <span className="text-xs text-gray-400">
                  <span className="text-rose-600">-{delCount}</span>{" / "}
                  <span className="text-emerald-600">+{addCount}</span>{" / "}
                  <span>未变 {sameCount}</span>
                </span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="关闭">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-auto bg-gray-50 p-3">
          {error ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : !diff ? (
            <div className="p-8 text-center text-sm text-gray-400">加载中...</div>
          ) : diff.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">两次提交完全相同</div>
          ) : (
            <pre className="font-mono text-xs leading-5">
              {diff.map((d, i) => {
                if (d.type === "same") {
                  return (
                    <div key={i} className="px-3 text-gray-600">
                      <span className="mr-2 select-none text-gray-300">&nbsp;</span>
                      {d.text || "\u00A0"}
                    </div>
                  );
                }
                if (d.type === "del") {
                  return (
                    <div key={i} className="bg-rose-100 px-3 text-rose-800">
                      <span className="mr-2 select-none font-bold">-</span>
                      {d.text || "\u00A0"}
                    </div>
                  );
                }
                return (
                  <div key={i} className="bg-emerald-100 px-3 text-emerald-800">
                    <span className="mr-2 select-none font-bold">+</span>
                    {d.text || "\u00A0"}
                  </div>
                );
              })}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
