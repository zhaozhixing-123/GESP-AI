"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const PLAN_LABELS: Record<string, string> = {
  free: "免费",
  monthly: "月卡",
  quarterly: "季卡",
  yearly: "年卡",
};

const LEVEL_OPTIONS = [3, 4, 5, 6, 7, 8];

interface ProfileData {
  id: number;
  email: string;
  nickname: string;
  role: string;
  plan: string;
  planExpireAt: string | null;
  targetLevel: number | null;
  examDate: string | null;
  phone: string | null;
  createdAt: string;
  isPaid: boolean;
  daysLeft: number | null;
  _count: { submissions: number };
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // edit state
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editExamDate, setEditExamDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    if (!token) { router.replace("/"); return; }
    fetch("/api/user/profile", { headers })
      .then((r) => {
        if (r.status === 401) { router.replace("/"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.user) {
          setProfile(data.user);
          setEditNickname(data.user.nickname ?? "");
          setEditPhone(data.user.phone ?? "");
          setEditLevel(data.user.targetLevel ? String(data.user.targetLevel) : "");
          setEditExamDate(
            data.user.examDate
              ? new Date(data.user.examDate).toISOString().slice(0, 10)
              : ""
          );
        }
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        nickname: editNickname,
        phone: editPhone,
        targetLevel: editLevel,
        examDate: editExamDate,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile((prev) => prev ? { ...prev, ...data.user } : prev);
      setEditing(false);
      setSaveMsg("保存成功");
      setTimeout(() => setSaveMsg(""), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="py-20 text-center text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!profile) return null;

  const isAdmin = profile.role === "admin";

  // subscription display info
  function renderPlanBadge() {
    if (isAdmin) {
      return (
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
          管理员（永久）
        </span>
      );
    }
    if (!profile!.isPaid) {
      return (
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500">
          免费用户
        </span>
      );
    }
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
        {PLAN_LABELS[profile!.plan] ?? profile!.plan}
      </span>
    );
  }

  function renderExpiry() {
    if (isAdmin) return <span className="text-gray-500">长期有效</span>;
    if (!profile!.planExpireAt) return <span className="text-gray-400">—</span>;
    const d = new Date(profile!.planExpireAt);
    const color =
      profile!.daysLeft !== null && profile!.daysLeft <= 3
        ? "text-red-500"
        : profile!.daysLeft !== null && profile!.daysLeft <= 7
        ? "text-orange-500"
        : "text-gray-600";
    return (
      <span className={color}>
        {d.toLocaleDateString("zh-CN")}
        {profile!.daysLeft !== null && (
          <span className="ml-1 text-xs text-gray-400">（剩 {profile!.daysLeft} 天）</span>
        )}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">个人中心</h1>

        {/* 账户信息 */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-700">账户信息</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">邮箱</span>
              <span className="font-medium text-gray-900">{profile.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">昵称</span>
              <span className="font-medium text-gray-900">{profile.nickname}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">注册时间</span>
              <span className="text-gray-600">
                {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">提交次数</span>
              <span className="text-gray-600">{profile._count.submissions} 次</span>
            </div>
          </div>
        </div>

        {/* 订阅状态 */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-700">订阅状态</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">当前套餐</span>
              {renderPlanBadge()}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">到期时间</span>
              {renderExpiry()}
            </div>
          </div>
          {!isAdmin && (
            <div className="mt-5">
              <Link
                href="/payment"
                className="inline-block rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {profile.isPaid ? "续费 / 升级" : "开通会员"}
              </Link>
            </div>
          )}
        </div>

        {/* 学习信息 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">学习信息</h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                编辑
              </button>
            )}
          </div>

          {saveMsg && (
            <p className="mb-3 text-sm text-green-600">{saveMsg}</p>
          )}

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  昵称
                </label>
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="2-20 个字符"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  目标级别
                </label>
                <select
                  value={editLevel}
                  onChange={(e) => setEditLevel(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">请选择</option>
                  {LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l} 级</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  考试日期
                </label>
                <input
                  type="date"
                  value={editExamDate}
                  onChange={(e) => setEditExamDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  手机号（选填）
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-md border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">目标级别</span>
                <span className="text-gray-700">
                  {profile.targetLevel ? `${profile.targetLevel} 级` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">考试日期</span>
                <span className="text-gray-700">
                  {profile.examDate
                    ? new Date(profile.examDate).toLocaleDateString("zh-CN")
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">手机号</span>
                <span className="text-gray-700">{profile.phone || "—"}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
