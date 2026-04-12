"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function PaymentSuccessPage() {
  const router = useRouter();

  // 确保 localStorage 中的用户信息已包含最新订阅状态
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="mb-4 text-6xl">🎉</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">支付成功！</h1>
        <p className="mb-8 text-sm text-gray-500">会员已开通，解锁全部功能，开始冲刺 GESP 吧</p>
        <button
          onClick={() => router.push("/problems")}
          className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          去刷题
        </button>
      </main>
    </div>
  );
}
