"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

interface UserRow {
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

const PLAN_LABELS: Record<string, string> = {
  free: "免费",
  monthly: "月卡",
  quarterly: "季卡",
  yearly: "年卡",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editPlan, setEditPlan] = useState("free");
  const [editExpireAt, setEditExpireAt] = useState("");
  const [editExtend, setEditExtend] = useState(false);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users", { headers });
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }

  function openEdit(user: UserRow) {
    setEditingUser(user);
    setEditPlan(user.plan);
    setEditExpireAt(
      user.planExpireAt
        ? new Date(user.planExpireAt).toISOString().slice(0, 10)
        : ""
    );
    setEditExtend(false);
  }

  async function handleSave() {
    if (!editingUser) return;
    setSaving(true);
    const body: Record<string, unknown> = { plan: editPlan };
    if (editPlan !== "free") {
      if (editExtend) {
        body.extend = true;
      } else if (editExpireAt) {
        body.planExpireAt = editExpireAt;
      }
    }
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditingUser(null);
      fetchUsers();
    }
    setSaving(false);
  }

  const filtered = users.filter((u) =>
    u.nickname.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <input
            type="text"
            placeholder="搜索昵称或邮箱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="mb-3 flex gap-4 text-sm text-gray-500">
          <span>共 {users.length} 个用户</span>
          <span>付费 {users.filter((u) => u.isPaid && u.role !== "admin").length} 人</span>
          <span>免费 {users.filter((u) => !u.isPaid && u.role !== "admin").length} 人</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">昵称</th>
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">套餐</th>
                  <th className="px-4 py-3 font-medium">到期时间</th>
                  <th className="px-4 py-3 font-medium">目标级别</th>
                  <th className="px-4 py-3 font-medium">提交数</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.nickname}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "admin" ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          管理员
                        </span>
                      ) : (
                        <span className="text-gray-500">用户</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "admin" ? (
                        <span className="text-gray-400">—</span>
                      ) : u.isPaid ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          {PLAN_LABELS[u.plan] ?? u.plan}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          免费
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.role === "admin" ? (
                        <span className="text-gray-400">长期有效</span>
                      ) : u.planExpireAt ? (
                        <span className={u.daysLeft !== null && u.daysLeft <= 7 ? "text-orange-500" : ""}>
                          {new Date(u.planExpireAt).toLocaleDateString("zh-CN")}
                          {u.daysLeft !== null && (
                            <span className="ml-1 text-xs text-gray-400">
                              ({u.daysLeft}天)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {u.targetLevel ? `${u.targetLevel} 级` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u._count.submissions}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-4 py-3">
                      {u.role !== "admin" && (
                        <button
                          onClick={() => openEdit(u)}
                          className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          设置订阅
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* 编辑订阅 Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-bold text-gray-900">
              设置订阅 — {editingUser.nickname}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">套餐</label>
                <div className="flex gap-2">
                  {(["free", "monthly", "quarterly", "yearly"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setEditPlan(p)}
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition ${
                        editPlan === p
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {editPlan !== "free" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">到期时间</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="extend"
                      checked={editExtend}
                      onChange={(e) => setEditExtend(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <label htmlFor="extend" className="text-sm text-gray-600">
                      在现有到期时间基础上续期（叠加）
                    </label>
                  </div>
                  {!editExtend && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        或指定到期日期（留空则从今天起算一个周期）
                      </label>
                      <input
                        type="date"
                        value={editExpireAt}
                        onChange={(e) => setEditExpireAt(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 rounded-md border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
