"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

// ---- Types ----

interface DashboardData {
  northStar: {
    p1: {
      current: number;
      target: number;
      rolling4wAvg: number;
      wow: { lastSame: number; delta: number; deltaPct: number | null };
    };
    p2: {
      active: number;
      denominator: number;
      ratio: number;
      lastFullWeek: number;
      rolling4wAvg: number;
      wow: { lastSame: number; delta: number };
    };
    window: {
      weekStart: string;
      weekEnd: string;
      lastSameStart: string;
      lastSameEnd: string;
    };
  };
  funnel: {
    thisWeek: { uv: number; signup: number; firstSubmit: number; paid: number };
    lastSame: { uv: number; signup: number; firstSubmit: number; paid: number };
  };
  levelDistribution: { level: number | null; count: number }[];
}

interface SilentUser {
  id: number;
  email: string;
  nickname: string;
  plan: string;
  planExpireAt: string | null;
  targetLevel: number | null;
  phone: string | null;
  joinedAt: string;
  lastSubmissionAt: string | null;
}

const PLAN_LABEL: Record<string, string> = {
  monthly: "月卡",
  quarterly: "季卡",
  yearly: "年卡",
};

// ---- Helpers ----

function fmtPct(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

function fmtDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function deltaColor(delta: number): string {
  if (delta > 0) return "text-green-600";
  if (delta < 0) return "text-red-600";
  return "text-gray-500";
}

function healthColor(ratio: number): { text: string; bg: string; border: string; label: string } {
  if (ratio >= 0.3) {
    return { text: "text-green-700", bg: "bg-green-50", border: "border-green-200", label: "🟢 健康" };
  }
  if (ratio >= 0.15) {
    return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "🟡 预警" };
  }
  return { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "🔴 告急" };
}

function daysBetween(from: string | null, to = new Date()): number | null {
  if (!from) return null;
  const diff = to.getTime() - new Date(from).getTime();
  return Math.floor(diff / 86_400_000);
}

// ---- Section: P1 ----

function P1Card({ data }: { data: DashboardData["northStar"]["p1"] }) {
  const pct = Math.min(100, (data.current / data.target) * 100);
  const wowPctStr = data.wow.deltaPct === null ? "—" : `${data.wow.deltaPct >= 0 ? "+" : ""}${data.wow.deltaPct.toFixed(1)}%`;

  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-8 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">P1 北极星</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">付费订阅用户数</h2>
          <p className="mt-1 text-xs text-gray-500">
            B 口径：当下有效订阅（plan≠free 且未过期，已剔除内部账号）
          </p>
        </div>
        <div className="text-right">
          <div className="text-6xl font-bold text-blue-700 tabular-nums">{data.current}</div>
          <div className="text-sm text-gray-500">/ {data.target} 目标</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex justify-between text-xs text-gray-600">
          <span>当前进度</span>
          <span className="font-medium">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">WoW（本周至今 vs 上周同期）</p>
          <p className="mt-1 text-sm text-gray-400">上周同期 {data.wow.lastSame}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${deltaColor(data.wow.delta)}`}>
            {fmtDelta(data.wow.delta)} <span className="text-sm">（{wowPctStr}）</span>
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">4 周滚动均值（辅助）</p>
          <p className="mt-1 text-sm text-gray-400">近 4 周每周起点付费快照均值</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{data.rolling4wAvg}</p>
        </div>
      </div>
    </section>
  );
}

// ---- Section: P2 ----

function P2Card({
  data,
  onShowSilent,
}: {
  data: DashboardData["northStar"]["p2"];
  onShowSilent: () => void;
}) {
  const h = healthColor(data.ratio);
  return (
    <section className={`rounded-2xl border ${h.border} ${h.bg} p-8 shadow-sm`}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${h.text}`}>P2 北极星</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">
            付费用户本周 AC ≥ 1 道 distinct 题
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            健康阈值：🟢 ≥ 30% · 🟡 15–30% · 🔴 &lt; 15%
          </p>
        </div>
        <div className="text-right">
          <div className={`text-6xl font-bold tabular-nums ${h.text}`}>
            {data.active}
            <span className="text-2xl font-normal text-gray-400"> / {data.denominator}</span>
          </div>
          <div className={`text-sm font-medium ${h.text}`}>
            {fmtPct(data.ratio)} · {h.label}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">WoW（本周至今 vs 上周同期）</p>
          <p className="mt-1 text-sm text-gray-400">上周同期 {data.wow.lastSame}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${deltaColor(data.wow.delta)}`}>
            {fmtDelta(data.wow.delta)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">上周完整周最终值</p>
          <p className="mt-1 text-sm text-gray-400">作为基线参考</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{data.lastFullWeek}</p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">4 周滚动均值（辅助）</p>
          <p className="mt-1 text-sm text-gray-400">近 4 个完整周 P2 均值</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{data.rolling4wAvg}</p>
        </div>
      </div>

      <button
        onClick={onShowSilent}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50"
      >
        下钻：查看付费但本周未 AC 用户 →
      </button>
    </section>
  );
}

// ---- Section: Funnel ----

function FunnelCard({ data }: { data: DashboardData["funnel"] }) {
  const steps: { key: keyof DashboardData["funnel"]["thisWeek"]; label: string; hint: string }[] = [
    { key: "uv", label: "访问 UV", hint: "distinct anonymousId 的 page_view" },
    { key: "signup", label: "注册用户", hint: "本周新增真实用户" },
    { key: "firstSubmit", label: "首次提交用户", hint: "首次提交落在本周（免费体验 1 道）" },
    { key: "paid", label: "付费用户", hint: "本周支付成功 distinct 人数" },
  ];
  const top = data.thisWeek.uv || 1;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">拉新 → 付费漏斗（本周）</h2>
      <p className="mt-1 text-xs text-gray-500">
        括号内为上周同期（本周至今对应的时段）对比
      </p>

      <div className="mt-6 space-y-3">
        {steps.map((step, idx) => {
          const v = data.thisWeek[step.key];
          const last = data.lastSame[step.key];
          const delta = v - last;
          const width = Math.max(4, (v / top) * 100);
          const convFromPrev =
            idx === 0
              ? null
              : data.thisWeek[steps[idx - 1].key] > 0
                ? (v / data.thisWeek[steps[idx - 1].key]) * 100
                : 0;

          return (
            <div key={step.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-gray-800">
                  {step.label}
                  <span className="ml-2 text-xs text-gray-400">{step.hint}</span>
                </span>
                <span className="tabular-nums">
                  <span className="font-bold text-gray-900">{v}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    （上周同期 {last}
                    <span className={`ml-1 ${deltaColor(delta)}`}>{fmtDelta(delta)}</span>）
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-gray-100">
                  <div
                    className="h-8 rounded-md bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
                {convFromPrev !== null && (
                  <span className="w-24 text-right text-xs text-gray-500">
                    上层转化 {convFromPrev.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Section: Level Distribution ----

function LevelCard({ data }: { data: DashboardData["levelDistribution"] }) {
  const total = data.reduce((a, b) => a + b.count, 0);
  const sorted = [...data].sort((a, b) => {
    if (a.level === null) return 1;
    if (b.level === null) return -1;
    return a.level - b.level;
  });
  const max = Math.max(...sorted.map((d) => d.count), 1);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">目标级别分布</h2>
      <p className="mt-1 text-xs text-gray-500">
        真实用户 · 共 {total} 人（已剔除内部账号和管理员）
      </p>

      <div className="mt-6 space-y-2">
        {sorted.map((row, i) => {
          const label = row.level === null ? "未填" : `${row.level} 级`;
          const pct = total > 0 ? (row.count / total) * 100 : 0;
          const w = (row.count / max) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="w-12 text-right text-sm text-gray-600">{label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
                <div
                  className={`h-6 rounded ${row.level === null ? "bg-gray-300" : "bg-blue-500"}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="w-24 text-right text-sm tabular-nums text-gray-700">
                {row.count} 人（{pct.toFixed(1)}%）
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Drill-down modal ----

function SilentUsersModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<SilentUser[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/admin/paid-silent-users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("加载失败");
        return r.json();
      })
      .then((d) => setUsers(d.users))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">付费但本周未 AC 用户</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {err && <p className="p-6 text-sm text-red-600">{err}</p>}
          {!users && !err && <p className="p-6 text-sm text-gray-500">加载中…</p>}
          {users && users.length === 0 && (
            <p className="p-6 text-sm text-gray-500">本周所有付费用户都至少 AC 了一道题 🎉</p>
          )}
          {users && users.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">用户</th>
                  <th className="px-4 py-3 text-left">套餐</th>
                  <th className="px-4 py-3 text-left">目标级别</th>
                  <th className="px-4 py-3 text-left">最近一次提交</th>
                  <th className="px-4 py-3 text-left">联系方式</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => {
                  const d = daysBetween(u.lastSubmissionAt);
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.nickname}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {PLAN_LABEL[u.plan] ?? u.plan}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {u.targetLevel ? `${u.targetLevel} 级` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {u.lastSubmissionAt ? (
                          <span className={d !== null && d > 7 ? "text-red-600" : "text-gray-700"}>
                            {d === 0 ? "今天" : `${d} 天前`}
                          </span>
                        ) : (
                          <span className="text-gray-400">从未提交</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {u.phone || <span className="text-gray-400">未填</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {users && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-500">
            共 {users.length} 人 · 建议运营按最近提交时间优先联系「≥ 7 天未提交」的用户
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Page ----

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSilent, setShowSilent] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("加载失败");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">北极星数据看板</h1>
          <p className="mt-1 text-sm text-gray-500">
            只看两件事：付费订阅人数，付费用户本周是否在学。口径统一为自然周（周一 00:00 – 周日
            23:59 Asia/Shanghai），已剔除内部账号。
          </p>
        </div>

        {loading && <p className="text-sm text-gray-500">加载中…</p>}
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}

        {data && (
          <div className="space-y-6">
            <P1Card data={data.northStar.p1} />
            <P2Card data={data.northStar.p2} onShowSilent={() => setShowSilent(true)} />
            <FunnelCard data={data.funnel} />
            <LevelCard data={data.levelDistribution} />

            <p className="pt-2 text-center text-xs text-gray-400">
              数据窗口：{new Date(data.northStar.window.weekStart).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })} —{" "}
              {new Date(data.northStar.window.weekEnd).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </p>
          </div>
        )}

        {showSilent && <SilentUsersModal onClose={() => setShowSilent(false)} />}
      </main>
    </div>
  );
}
