"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type Phase = "loading" | "setup" | "login" | "settings";

export default function ParentSettingsPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [parentToken, setParentToken] = useState("");

  // 设置页状态
  const [webhook, setWebhook] = useState("");
  const [thresholdMin, setThresholdMin] = useState(2);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // 改密码
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 检查是否已设置家长密码
  useEffect(() => {
    async function check() {
      const res = await fetch("/api/parent/status", { headers });
      if (res.ok) {
        const data = await res.json();
        setPhase(data.hasParentPassword ? "login" : "setup");
      }
    }
    check();
  }, []);

  // 首次设置家长密码
  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("密码至少 6 位"); return; }
    if (password !== confirmPassword) { setError("两次密码不一致"); return; }

    const res = await fetch("/api/parent/setup", {
      method: "POST", headers,
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok) {
      setPassword("");
      setConfirmPassword("");
      setPhase("login");
      setMessage("家长密码设置成功，请输入密码进入设置");
    } else {
      setError(data.error);
    }
  }

  // 验证家长密码
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/parent", {
      method: "POST", headers,
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok) {
      setParentToken(data.parentToken);
      setPassword("");
      setPhase("settings");
      // 加载设置
      const settingsRes = await fetch("/api/parent", {
        headers: { ...headers, "x-parent-token": data.parentToken },
      });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setWebhook(settings.feishuWebhook || "");
        setThresholdMin(settings.notifyThresholdMin ?? 2);
      }
    } else {
      setError(data.error);
    }
  }

  // 保存 Webhook
  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/parent", {
      method: "PUT",
      headers: { ...headers, "x-parent-token": parentToken },
      body: JSON.stringify({ feishuWebhook: webhook, notifyThresholdMin: thresholdMin }),
    });
    const data = await res.json();
    if (res.ok) setMessage("保存成功");
    else setError(data.error);
    setSaving(false);
  }

  // 测试 Webhook
  async function handleTest() {
    setTesting(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/parent/test-webhook", {
      method: "POST", headers,
      body: JSON.stringify({ webhookUrl: webhook }),
    });
    const data = await res.json();
    if (res.ok) setMessage(data.message);
    else setError(data.error);
    setTesting(false);
  }

  // 修改家长密码
  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault();
    setChangingPw(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/parent/password", {
      method: "PUT", headers,
      body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message);
      setOldPw("");
      setNewPw("");
      setShowChangePw(false);
    } else {
      setError(data.error);
    }
    setChangingPw(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">家长设置</h1>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {message && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">{message}</div>}

        {/* 加载中 */}
        {phase === "loading" && (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        )}

        {/* 首次设置家长密码 */}
        {phase === "setup" && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">设置家长密码</h2>
            <p className="mb-4 text-sm text-gray-500">
              设置一个独立的家长密码，用于保护家长设置页面（飞书通知等），防止孩子自行修改。
            </p>
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">家长密码</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm" placeholder="至少 6 位" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">确认密码</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm" placeholder="再输入一次" required />
              </div>
              <button type="submit"
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                设置密码
              </button>
            </form>
          </div>
        )}

        {/* 验证家长密码 */}
        {phase === "login" && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">验证家长身份</h2>
            <p className="mb-4 text-sm text-gray-500">请输入家长密码以进入设置页面。</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder="家长密码" required autoFocus />
              <button type="submit"
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                验证
              </button>
            </form>
          </div>
        )}

        {/* 设置页 */}
        {phase === "settings" && (
          <div className="space-y-6">
            {/* 飞书 Webhook */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">飞书通知</h2>
              <p className="mb-4 text-sm text-gray-500">
                配置飞书机器人 Webhook，孩子分心时自动发送通知到飞书群。
              </p>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Webhook URL</label>
                <input type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  分心多久后通知：<span className="font-bold text-blue-600">{thresholdMin} 分钟</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={thresholdMin}
                  onChange={(e) => setThresholdMin(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>1 分钟</span>
                  <span>5 分钟</span>
                  <span>10 分钟</span>
                  <span>15 分钟</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
                <button onClick={handleTest} disabled={testing || !webhook}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {testing ? "发送中..." : "发送测试消息"}
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-xs text-gray-600 space-y-3">
                <p className="font-medium text-gray-800">如何配置飞书通知（需在电脑端飞书操作，手机端不支持）：</p>
                <ol className="list-inside list-decimal space-y-2 leading-relaxed">
                  <li>
                    打开 <span className="font-medium text-gray-800">电脑端飞书</span>，创建一个群聊（可以只拉自己一个人）
                  </li>
                  <li>
                    点击群聊窗口右上角的 <span className="font-medium text-gray-800">「...」</span> 图标，在弹出菜单中点击 <span className="font-medium text-gray-800">「设置」</span>
                  </li>
                  <li>
                    在设置页面滚动找到 <span className="font-medium text-gray-800">「群机器人」</span>，点击 <span className="font-medium text-gray-800">「添加机器人」</span>
                  </li>
                  <li>
                    在机器人列表中找到并选择 <span className="font-medium text-gray-800">「自定义机器人」</span>（Custom Bot），给机器人取个名字，如 <span className="text-gray-800">"GESP 通知"</span>
                  </li>
                  <li>
                    <span className="font-medium text-red-600">重要：</span>安全设置选择 <span className="font-medium text-gray-800">「自定义关键词」</span>，在输入框中填写 <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 font-mono font-medium text-blue-700">GESP</span>
                  </li>
                  <li>
                    点击 <span className="font-medium text-gray-800">「完成」</span>，页面会显示一个 Webhook 地址（以 https://open.feishu.cn/ 开头），<span className="font-medium text-gray-800">复制整个地址</span>粘贴到上方输入框
                  </li>
                  <li>
                    点击上方的 <span className="font-medium text-gray-800">「保存」</span>，然后点 <span className="font-medium text-gray-800">「发送测试消息」</span> 验证是否收到通知
                  </li>
                </ol>
                <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-700">
                  注意：安全设置务必选「自定义关键词」并填写 GESP，否则消息会被飞书拦截无法送达。
                </p>
              </div>
            </div>

            {/* 修改家长密码 */}
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">家长密码</h2>
                <button onClick={() => setShowChangePw(!showChangePw)}
                  className="text-sm text-blue-600 hover:underline">
                  {showChangePw ? "取消" : "修改密码"}
                </button>
              </div>
              {showChangePw && (
                <form onSubmit={handleChangePw} className="mt-4 space-y-3">
                  <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm" placeholder="当前家长密码" required />
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm" placeholder="新密码（至少 6 位）" required />
                  <button type="submit" disabled={changingPw}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {changingPw ? "修改中..." : "确认修改"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
