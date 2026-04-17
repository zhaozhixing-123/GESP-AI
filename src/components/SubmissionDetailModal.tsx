"use client";

import { useEffect, useState } from "react";
import CodeEditor from "./CodeEditor";
import { STATUS_COLORS, STATUS_TEXT } from "@/lib/submission-status";

interface SubmissionDetail {
  id: number;
  code: string;
  status: string;
  language: string;
  timeUsed: number | null;
  memoryUsed: number | null;
  createdAt: string;
}

interface Props {
  submissionId: number;
  variant: boolean;
  onClose: () => void;
  onLoad: (code: string) => void;
}

export default function SubmissionDetailModal({ submissionId, variant, onClose, onLoad }: Props) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const url = variant
      ? `/api/variants/submissions/${submissionId}`
      : `/api/submissions/${submissionId}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "加载失败");
        }
        return res.json();
      })
      .then((data: SubmissionDetail) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(e.message || "加载失败");
      });

    return () => controller.abort();
  }, [submissionId, variant]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏：状态 + 元信息 */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">提交详情</h3>
            {detail && (
              <>
                <span className={`text-sm font-bold ${STATUS_COLORS[detail.status] || "text-gray-600"}`}>
                  {STATUS_TEXT[detail.status] || detail.status}
                </span>
                <span className="text-xs text-gray-400">
                  {detail.timeUsed != null && <span className="mr-3">{detail.timeUsed}ms</span>}
                  {detail.memoryUsed != null && <span className="mr-3">{detail.memoryUsed}KB</span>}
                  <span>
                    {new Date(detail.createdAt).toLocaleString("zh-CN", {
                      year: "numeric", month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 代码区 */}
        <div className="min-h-[480px] p-0">
          {error ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : !detail ? (
            <div className="p-8 text-center text-sm text-gray-400">加载中...</div>
          ) : (
            <CodeEditor
              value={detail.code}
              onChange={() => {}}
              height="480px"
              readOnly
            />
          )}
        </div>

        {/* 底栏：关闭 / 载入到编辑器 */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            onClick={() => detail && onLoad(detail.code)}
            disabled={!detail}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            载入到编辑器
          </button>
        </div>
      </div>
    </div>
  );
}
