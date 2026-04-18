"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

type Step = "email" | "info";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");

  // 第一步
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 第二步
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [targetLevel, setTargetLevel] = useState("");
  const [examDate, setExamDate] = useState("");
  const [phone, setPhone] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    setError("");
    if (!email) { setError("请输入邮箱"); return; }

    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "register" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "发送失败"); return; }

      setCodeSent(true);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSendingCode(false);
    }
  }

  function handleNextStep() {
    setError("");
    if (!email) { setError("请输入邮箱"); return; }
    if (!code || code.length !== 6) { setError("请输入 6 位验证码"); return; }
    setStep("info");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          nickname,
          password,
          targetLevel: targetLevel ? parseInt(targetLevel) : undefined,
          examDate: examDate || undefined,
          phone: phone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "注册失败");
        if (data.error?.includes("验证码")) setStep("email");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      trackEvent("signup_submit", {
        metadata: { targetLevel: targetLevel || null },
      });
      router.push("/problems?welcome=1");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-8">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">GESP.AI</h1>
        <p className="mb-6 text-center text-sm text-gray-500">创建新账号</p>

        {step === "email" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">邮箱</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="请输入邮箱"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0}
                  className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : sendingCode ? "发送中..." : "发送验证码"}
                </button>
              </div>
            </div>

            {codeSent && (
              <div>
                <label className="block text-sm font-medium text-gray-700">验证码</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono tracking-widest focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="6 位数字验证码"
                  maxLength={6}
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleNextStep}
              disabled={!codeSent || code.length !== 6}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              下一步
            </button>
          </div>
        )}

        {step === "info" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              邮箱：{email}
              <button type="button" onClick={() => setStep("email")} className="ml-2 text-blue-500 hover:underline text-xs">
                修改
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="2-20 个字符"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="至少 6 个字符，含字母和数字"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="再次输入密码"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                目标考试级别 <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">暂不选择</option>
                {[3, 4, 5, 6, 7, 8].map((l) => (
                  <option key={l} value={l}>{l} 级</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                目标考试日期 <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                手机号 <span className="text-gray-400 font-normal">（选填）</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="用于接收重要通知"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "注册中..." : "注册"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          已有账号？{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
