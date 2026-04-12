"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const PLANS = [
  {
    id: "monthly",
    name: "月卡",
    price: 99,
    period: "月",
    perMonth: 99,
    highlight: false,
    desc: "灵活体验",
  },
  {
    id: "quarterly",
    name: "季卡",
    price: 199,
    period: "3个月",
    perMonth: 66,
    highlight: true,
    desc: "最受欢迎",
  },
  {
    id: "yearly",
    name: "年卡",
    price: 599,
    period: "年",
    perMonth: 50,
    highlight: false,
    desc: "最划算",
  },
] as const;

type PlanId = "monthly" | "quarterly" | "yearly";

export default function PaymentPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("quarterly");
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pollExpired, setPollExpired] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 秒
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      if (countdownRef.current !== null) clearInterval(countdownRef.current);
    };
  }, []);

  async function handlePay() {
    setCreating(true);
    setError("");
    setQrcodeUrl(null);
    setOrderNo(null);
    setPollExpired(false);

    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "创建订单失败");
        return;
      }

      setQrcodeUrl(data.qrcodeUrl);
      setOrderNo(data.orderNo);
      setTimeLeft(300);
      startCountdown();
      startPolling(data.orderNo);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setCreating(false);
    }
  }

  function startCountdown() {
    if (countdownRef.current !== null) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimers() {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    if (countdownRef.current !== null) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  function startPolling(no: string) {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    const deadline = Date.now() + 5 * 60 * 1000; // 5 分钟
    timerRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        stopTimers();
        setPollExpired(true);
        return;
      }
      try {
        const res = await fetch(`/api/payment/status?orderNo=${no}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.status === "paid") {
          stopTimers();
          // 从服务端拉取完整用户信息（含 isPaid / daysLeft）
          try {
            const meRes = await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              localStorage.setItem("user", JSON.stringify(meData.user));
            }
          } catch {}
          router.push("/payment/success");
        }
      } catch {}
    }, 2000);
  }

  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">开通会员</h1>
        <p className="mb-8 text-center text-sm text-gray-500">解锁全部真题、AI 老师、错题分析等功能</p>

        {/* 套餐选择 */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlan(p.id)}
              className={`relative rounded-xl border-2 p-4 text-left transition ${
                selectedPlan === p.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-medium text-white whitespace-nowrap">
                  {p.desc}
                </span>
              )}
              <div className="text-base font-bold text-gray-900">{p.name}</div>
              <div className="mt-1 text-2xl font-bold text-blue-600">¥{p.price}</div>
              <div className="text-xs text-gray-400">/{p.period}</div>
              <div className="mt-1 text-xs text-gray-500">约 ¥{p.perMonth}/月</div>
              {!p.highlight && (
                <div className="mt-1 text-xs text-gray-400">{p.desc}</div>
              )}
            </button>
          ))}
        </div>

        {/* 二维码区域 */}
        {qrcodeUrl ? (
          <div className="rounded-xl bg-white p-6 shadow-sm text-center">
            <p className="mb-4 text-sm text-gray-600">
              请用微信扫码支付 <span className="font-bold text-gray-900">¥{plan.price}</span>
            </p>
            <div className="mx-auto mb-4 h-48 w-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrcodeUrl} alt="支付二维码" className="h-full w-full object-contain" />
            </div>
            {pollExpired ? (
              <div className="space-y-3">
                <p className="text-sm text-orange-500">订单已超时，请重新下单</p>
                <button
                  onClick={() => { setQrcodeUrl(null); setOrderNo(null); setPollExpired(false); setTimeLeft(300); }}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  重新下单
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-gray-400">等待支付中，支付成功后自动跳转</p>
                <p className="text-xs text-gray-400">
                  剩余&nbsp;
                  <span className={timeLeft <= 60 ? "font-semibold text-orange-500" : "text-gray-500"}>
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                  </span>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
              <span>已选套餐</span>
              <span className="font-medium text-gray-900">{plan.name} · ¥{plan.price}</span>
            </div>
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            <button
              onClick={handlePay}
              disabled={creating}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "生成支付码..." : "微信扫码支付"}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">支付即表示同意服务条款</p>
          </div>
        )}

        {/* 功能清单 */}
        <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-gray-700">会员权益</div>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              { text: "全部 GESP C++ 真题（含历年真卷）", done: true },
              { text: "AI 老师无限次对话辅导", done: true },
              { text: "错题本 + AI 错因分析", done: true },
              { text: "知识点掌握率仪表盘", done: false },
              { text: "智能推题（基于薄弱知识点）", done: false },
              { text: "周度学习报告自动生成", done: false },
            ].map(({ text, done }) => (
              <li key={text} className="flex items-start gap-2">
                <span className={`mt-0.5 ${done ? "text-green-500" : "text-gray-300"}`}>✓</span>
                <span className={done ? "" : "text-gray-400"}>
                  {text}
                  {!done && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">即将上线</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
