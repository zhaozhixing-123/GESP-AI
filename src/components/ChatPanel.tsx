"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  problemId: number;
  code: string;
  initialMessage?: string;
  title?: string;  // 面板标题，默认 "AI 老师"
}

export default function ChatPanel({ problemId, code, initialMessage, title }: ChatPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [includeCode, setIncludeCode] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [model, setModel] = useState("");
  // "free_limit" | "chat_limit" | null
  const [limitType, setLimitType] = useState<"free_limit" | "chat_limit" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // 加载聊天历史
  useEffect(() => {
    async function loadHistory() {
      const res = await fetch(`/api/chat?problemId=${problemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const history = data.messages || [];
        setMessages(history);
        // 聊天记录为空且有 initialMessage 时，自动触发一次分析
        if (history.length === 0 && initialMessage && !initialSentRef.current) {
          initialSentRef.current = true;
          sendMessage(initialMessage);
        }
      }
    }
    loadHistory();
  }, [problemId]);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;

    setSending(true);
    setStreaming("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problemId,
          message: text,
          code: includeCode ? code : undefined,
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
              }
              if (data.error) {
                fullText += `\n\n[错误: ${data.error}]`;
                setStreaming(fullText);
              }
            } catch {}
          }
        }
      }

      // 流结束，把流式内容转为正式消息
      if (fullText) {
        setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
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
          <span className="text-sm font-semibold text-gray-900">{title ?? "AI 老师"}</span>
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
          <div className="py-8 text-center text-sm text-gray-400">
            有问题就问 AI 老师吧！我会引导你思考，但不会直接给答案哦。
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
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
              AI 老师正在思考...
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
