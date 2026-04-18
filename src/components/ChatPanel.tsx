"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface FeedbackState {
  vote: "up" | "down";
  reasons: string[];
  comment: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  chatHistoryId?: number;              // 仅 assistant 有值
  feedback?: FeedbackState | null;     // 仅 assistant 有值
}

const FEEDBACK_REASONS = ["不准确", "太浅", "听不懂", "跑题", "其他"] as const;

function ChatFeedback({
  chatHistoryId,
  token,
  initial,
  onChange,
}: {
  chatHistoryId: number;
  token: string | null;
  initial: FeedbackState | null;
  onChange: (next: FeedbackState | null) => void;
}) {
  const [vote, setVote] = useState<FeedbackState["vote"] | null>(initial?.vote ?? null);
  const [reasons, setReasons] = useState<string[]>(initial?.reasons ?? []);
  const [comment, setComment] = useState<string>(initial?.comment ?? "");
  const [expanded, setExpanded] = useState<boolean>(
    initial?.vote === "down" && (initial?.reasons.length ?? 0) === 0,
  );
  const [submitting, setSubmitting] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;

  async function handleVote(next: "up" | "down") {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ targetType: "chat", targetId: chatHistoryId, vote: next }),
      });
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as { vote: "up" | "down" | null };
      setVote(data.vote);
      if (data.vote === null || data.vote === "up") {
        // toggle 清除 或 切到赞 → 清空原因
        setReasons([]);
        setComment("");
        setExpanded(false);
      } else if (data.vote === "down") {
        // 刚点下踩 → 展开原因区让用户选
        setExpanded(true);
      }
      onChange(data.vote ? { vote: data.vote, reasons: [], comment: null } : null);
    } catch {
      setSavedMsg("提交失败，请重试");
      setTimeout(() => setSavedMsg(""), 2000);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleReason(r: string) {
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function submitReasons() {
    if (submitting) return;
    if (reasons.length === 0) return;
    if (reasons.includes("其他") && !comment.trim()) {
      setSavedMsg("选择「其他」时请写一句话");
      setTimeout(() => setSavedMsg(""), 2000);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          targetType: "chat",
          targetId: chatHistoryId,
          reasons,
          comment: reasons.includes("其他") ? comment.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error("fail");
      setSavedMsg("已反馈，谢谢");
      setExpanded(false);
      onChange({ vote: "down", reasons, comment: reasons.includes("其他") ? comment.trim() : null });
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("提交失败，请重试");
      setTimeout(() => setSavedMsg(""), 2000);
    } finally {
      setSubmitting(false);
    }
  }

  const baseBtn = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition disabled:opacity-50";
  const activeUp = "border-blue-400 bg-blue-50 text-blue-700";
  const activeDown = "border-rose-400 bg-rose-50 text-rose-700";
  const idle = "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700";

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleVote("up")}
          disabled={submitting}
          className={`${baseBtn} ${vote === "up" ? activeUp : idle}`}
          aria-label="赞"
        >
          <span>👍</span>
        </button>
        <button
          type="button"
          onClick={() => handleVote("down")}
          disabled={submitting}
          className={`${baseBtn} ${vote === "down" ? activeDown : idle}`}
          aria-label="踩"
        >
          <span>👎</span>
        </button>
        {vote === "down" && !expanded && (reasons.length > 0 || savedMsg) && (
          <span className="text-xs text-gray-400">
            {savedMsg || `已选 ${reasons.length} 项`}
            {reasons.length > 0 && !savedMsg && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="ml-1 text-blue-600 hover:underline"
              >
                修改
              </button>
            )}
          </span>
        )}
        {savedMsg && !(vote === "down" && !expanded) && (
          <span className="text-xs text-gray-400">{savedMsg}</span>
        )}
      </div>

      {vote === "down" && expanded && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
          <div className="flex flex-wrap gap-1">
            {FEEDBACK_REASONS.map((r) => {
              const on = reasons.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleReason(r)}
                  className={`${baseBtn} ${on ? "border-rose-400 bg-rose-50 text-rose-700" : idle}`}
                >
                  {r}
                </button>
              );
            })}
          </div>
          {reasons.includes("其他") && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="一句话描述（最多 200 字）"
              className="mt-1.5 w-full resize-none rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          )}
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitReasons}
              disabled={submitting || reasons.length === 0}
              className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              提交
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK_PROMPTS = [
  { title: "思路引导", hint: "我没什么头绪，请一步步引导我想", prompt: "我看完题目没什么头绪，请一步步引导我自己想出思路，不要直接给答案。" },
  { title: "算法选择", hint: "这道题适合用什么算法/数据结构？", prompt: "这道题属于哪一类问题？适合用什么算法或数据结构？请先不要直接告诉我解法，可以先问我几个引导性的问题。" },
  { title: "边界检查", hint: "哪些边界容易漏？", prompt: "这道题有哪些常见的边界或特殊情况容易漏掉？请引导我一个个排查，不要直接给出完整检查表。" },
  { title: "看我的代码", hint: "我卡住了，帮我看看代码哪里有问题", prompt: "我写到一半卡住了，请先别改代码，引导我自己定位问题可能在哪。" },
];

interface ChatPanelProps {
  problemId?: number;
  variantId?: number;
  code: string;
  initialMessage?: string;
  title?: string;  // 面板标题，默认 "AI 老师"
  // 外部触发发送：nonce 变化时发送 text，可携带 code
  triggerSend?: { text: string; code?: string; nonce: number };
}

export default function ChatPanel({ problemId, variantId, code, initialMessage, title, triggerSend }: ChatPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [includeCode, setIncludeCode] = useState(true);
  const [streaming, setStreaming] = useState("");
  const [model, setModel] = useState("");
  // "free_limit" | "chat_limit" | null
  const [limitType, setLimitType] = useState<"free_limit" | "chat_limit" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const lastTriggerNonce = useRef(-1);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // 加载聊天历史：problemId/variantId 切换时要重新拉；
  // 组件卸载或切题时通过 AbortController 取消 in-flight 请求，避免卸载后 setState
  useEffect(() => {
    const controller = new AbortController();
    async function loadHistory() {
      const historyQuery = variantId ? `variantId=${variantId}` : `problemId=${problemId}`;
      try {
        const res = await fetch(`/api/chat?${historyQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        const history = data.messages || [];
        setMessages(history);
        if (history.length === 0 && initialMessage && !initialSentRef.current) {
          initialSentRef.current = true;
          sendMessage(initialMessage);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        // 其他错误静默：UI 层保持空聊天列表即可
      }
    }
    loadHistory();
    return () => controller.abort();
  // sendMessage/initialMessage 故意排除——变化会导致无限循环
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId, variantId]);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // 外部触发发送
  useEffect(() => {
    if (!triggerSend || triggerSend.nonce === lastTriggerNonce.current) return;
    lastTriggerNonce.current = triggerSend.nonce;
    sendMessage(triggerSend.text, triggerSend.code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSend?.nonce]);

  async function sendMessage(text: string, overrideCode?: string) {
    if (!text.trim() || sending) return;

    setSending(true);
    setStreaming("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const codeToSend = overrideCode !== undefined ? overrideCode : (includeCode ? code : undefined);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problemId: variantId ? undefined : problemId,
          variantId: variantId ?? undefined,
          message: text,
          code: codeToSend,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "free_limit" || data.error === "chat_limit") {
          // 移除刚才加入的用户消息，改为展示限额提示
          setMessages((prev) => prev.slice(0, -1));
          setLimitType(data.error);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: `错误: ${data.message ?? data.error}` }]);
        }
        setSending(false);
        return;
      }

      // 读取 SSE 流
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let chatHistoryId: number | undefined;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                setStreaming(fullText);
              }
              if (data.done) {
                setModel(data.model || "");
                if (typeof data.chatHistoryId === "number") {
                  chatHistoryId = data.chatHistoryId;
                }
              }
              if (data.error) {
                fullText += `\n\n[错误: ${data.error}]`;
                setStreaming(fullText);
              }
            } catch {}
          }
        }
      }

      // 流结束，把流式内容转为正式消息（携带 chatHistoryId 以便挂反馈组件）
      if (fullText) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullText, chatHistoryId, feedback: null },
        ]);
      }
      setStreaming("");
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "网络错误，请重试" }]);
    }

    setSending(false);
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    await sendMessage(userMsg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{title ?? "GESP AI 私教"}</span>
          {model && <span className="text-xs text-gray-400">({model})</span>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={includeCode}
            onChange={(e) => setIncludeCode(e.target.checked)}
            className="rounded"
          />
          附带当前代码
        </label>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="space-y-3">
            <div className="text-center text-sm text-gray-500">
              有问题就问 GESP AI 私教吧！点一张卡片快速开聊，或者直接输入问题。
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((card) => (
                <button
                  key={card.title}
                  onClick={() => sendMessage(card.prompt)}
                  disabled={sending}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-gray-900">{card.title}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{card.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${msg.role === "user" ? "" : "w-full"}`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:my-1">
                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {msg.content}
                    </Markdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
              {msg.role === "assistant" && msg.chatHistoryId !== undefined && (
                <ChatFeedback
                  chatHistoryId={msg.chatHistoryId}
                  token={token}
                  initial={msg.feedback ?? null}
                  onChange={(next) => {
                    setMessages((prev) =>
                      prev.map((m, idx) =>
                        idx === i ? { ...m, feedback: next } : m,
                      ),
                    );
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {/* 流式输出中 */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800">
              <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:my-1">
                <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {streaming}
                </Markdown>
              </div>
            </div>
          </div>
        )}

        {sending && !streaming && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-400">
              GESP AI 私教正在思考...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 限额提示 */}
      {limitType && (
        <div className="border-t bg-amber-50 px-4 py-3">
          <p className="mb-2 text-sm text-amber-800">
            {limitType === "chat_limit"
              ? "免费对话已用完（每题限 5 次），订阅后无限对话"
              : "免费体验已用完（限 1 道题），订阅后解锁全部题目"}
          </p>
          <button
            onClick={() => router.push("/payment")}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            立即订阅
          </button>
        </div>
      )}

      {/* 输入框 */}
      {!limitType && (
        <div className="border-t p-3">
          {/* 快捷提问 chip 行：始终可点，避免卡片只能用一次 */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((card) => (
              <button
                key={card.title}
                onClick={() => sendMessage(card.prompt)}
                disabled={sending}
                title={card.hint}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
              >
                {card.title}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题...（Enter 发送，Shift+Enter 换行）"
              className="flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
