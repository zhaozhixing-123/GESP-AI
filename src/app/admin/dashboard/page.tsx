"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

// ---- Types ----

interface DashboardData {
  growth: {
    dailyRegistrations: { date: string; count: number }[];
    totalUsers: number;
    paidUsers: number;
    freeUsers: number;
    conversionRate: number;
    planDistribution: { plan: string; count: number }[];
    mrr: number;
    revenue30d: { amount: number; orderCount: number };
    dau: number;
    wau: number;
    mau: number;
    retention: {
      d1: { cohortSize: number; retained: number };
      d7: { cohortSize: number; retained: number };
      d30: { cohortSize: number; retained: number };
    };
  };
  learning: {
    totalSubmissions: number;
    totalAC: number;
    activeSubmitters: number;
    avgSubmissionsPerUser: number;
    avgACPerUser: number;
    passRateDistribution: { range: string; count: number }[];
    errorTypeTop5: { errorType: string; count: number }[];
    chatMessageCount: number;
    chatUserCount: number;
    variantUnlocks: number;
    variantSubmissions: number;
    variantAC: number;
  };
  operations: {
    hourlyDistribution: { hour: number; count: number }[];
    levelDistribution: { level: number; count: number }[];
    examUsers: number;
  };
}

type Tab = "growth" | "learning" | "operations";

// ---- Helper Components ----

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <p className="py-4 text-sm text-gray-400">暂无数据</p>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const chartH = 160;
  const padTop = 10;
  const padBottom = 28;
  const totalH = chartH + padTop + padBottom;
  const barW = Math.max(4, 560 / data.length - 2);

  return (
    <svg viewBox={`0 0 600 ${totalH}`} className="w-full">
      {data.map((d, i) => {
        const x = 20 + (i / data.length) * 560;
        const h = (d.value / maxVal) * chartH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={padTop + chartH - h}
              width={barW}
              height={Math.max(h, 1)}
              fill="#3b82f6"
              rx={2}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {(i % Math.max(1, Math.floor(data.length / 6)) === 0 || i === data.length - 1) && (
              <text
                x={x + barW / 2}
                y={padTop + chartH + 16}
                textAnchor="middle"
                fill="#9ca3af"
                style={{ fontSize: 10 }}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HorizontalBar({
  items,
  color = "#3b82f6",
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-gray-400">暂无数据</p>;
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-700">{item.label}</span>
            <span className="font-medium text-gray-900">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(item.value / maxVal) * 100}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RetentionBadge({
  label,
  cohortSize,
  retained,
}: {
  label: string;
  cohortSize: number;
  retained: number;
}) {
  const rate = cohortSize > 0 ? ((retained / cohortSize) * 100).toFixed(1) : "—";
  const color =
    cohortSize === 0
      ? "text-gray-400"
      : Number(rate) >= 30
        ? "text-green-600"
        : Number(rate) >= 10
          ? "text-amber-600"
          : "text-red-600";
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{cohortSize > 0 ? `${rate}%` : "—"}</p>
      <p className="text-xs text-gray-400">
        {cohortSize > 0 ? `${retained}/${cohortSize}` : "无数据"}
      </p>
    </div>
  );
}

// ---- Plan label ----
const planLabels: Record<string, string> = {
  monthly: "月卡",
  quarterly: "季卡",
  yearly: "年卡",
};

// ---- Main Page ----

const tabs: [Tab, string][] = [
  ["growth", "增长"],
  ["learning", "学习"],
  ["operations", "运营"],
];

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("growth");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">数据看板</h1>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === id ? "bg-white text-gray-900 shadow" : "text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {/* ========== Growth Tab ========== */}
        {!loading && data && tab === "growth" && (
          <>
            {/* KPI cards */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="总用户" value={data.growth.totalUsers} />
              <StatCard label="付费用户" value={data.growth.paidUsers} />
              <StatCard label="免费用户" value={data.growth.freeUsers} />
              <StatCard
                label="转化率"
                value={`${(data.growth.conversionRate * 100).toFixed(1)}%`}
              />
            </div>

            {/* Registration trend */}
            <div className="mb-6 rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-base font-semibold text-gray-900">30 天注册趋势</h2>
              <BarChart
                data={data.growth.dailyRegistrations.map((d) => ({
                  label: d.date.slice(5),
                  value: d.count,
                }))}
              />
            </div>

            {/* DAU / WAU / MAU */}
            <div className="mb-6 grid grid-cols-3 gap-4">
              <StatCard label="DAU (日活)" value={data.growth.dau} />
              <StatCard label="WAU (周活)" value={data.growth.wau} />
              <StatCard label="MAU (月活)" value={data.growth.mau} />
            </div>

            {/* Revenue */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <StatCard
                label="MRR"
                value={`¥${(data.growth.mrr / 100).toFixed(0)}`}
                sub="月均经常性收入"
              />
              <StatCard
                label="近 30 天收入"
                value={`¥${(data.growth.revenue30d.amount / 100).toFixed(0)}`}
                sub={`${data.growth.revenue30d.orderCount} 笔订单`}
              />
            </div>

            {/* Plan distribution + Retention */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-base font-semibold text-gray-900">付费套餐分布</h2>
                <HorizontalBar
                  items={data.growth.planDistribution.map((p) => ({
                    label: planLabels[p.plan] || p.plan,
                    value: p.count,
                  }))}
                />
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-base font-semibold text-gray-900">新用户留存</h2>
                <div className="flex justify-around pt-2">
                  <RetentionBadge label="次日 (D1)" {...data.growth.retention.d1} />
                  <RetentionBadge label="7日 (D7)" {...data.growth.retention.d7} />
                  <RetentionBadge label="30日 (D30)" {...data.growth.retention.d30} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========== Learning Tab ========== */}
        {!loading && data && tab === "learning" && (
          <>
            {/* Submission KPIs */}
            <div className="mb-6 grid grid-cols-3 gap-4">
              <StatCard label="总提交" value={data.learning.totalSubmissions.toLocaleString()} />
              <StatCard label="总 AC" value={data.learning.totalAC.toLocaleString()} />
              <StatCard label="做题用户" value={data.learning.activeSubmitters} />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <StatCard label="人均提交" value={data.learning.avgSubmissionsPerUser} />
              <StatCard label="人均 AC" value={data.learning.avgACPerUser} />
            </div>

            {/* Pass rate + Error types */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-base font-semibold text-gray-900">题目通过率分布</h2>
                <HorizontalBar
                  items={data.learning.passRateDistribution.map((b) => ({
                    label: b.range,
                    value: b.count,
                  }))}
                  color="#22c55e"
                />
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-base font-semibold text-gray-900">错误类型 TOP 5</h2>
                <HorizontalBar
                  items={data.learning.errorTypeTop5.map((e) => ({
                    label: e.errorType || "未分类",
                    value: e.count,
                  }))}
                  color="#ef4444"
                />
              </div>
            </div>

            {/* AI tutoring */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <StatCard
                label="AI 对话消息"
                value={data.learning.chatMessageCount.toLocaleString()}
                sub={`${data.learning.chatUserCount} 位用户使用`}
              />
              <StatCard
                label="AI 使用率"
                value={
                  data.learning.activeSubmitters > 0
                    ? `${((data.learning.chatUserCount / data.learning.activeSubmitters) * 100).toFixed(0)}%`
                    : "—"
                }
                sub="做题用户中使用 AI 辅导的比例"
              />
            </div>

            {/* Variants */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="变形题解锁" value={data.learning.variantUnlocks} />
              <StatCard label="变形题提交" value={data.learning.variantSubmissions} />
              <StatCard label="变形题 AC" value={data.learning.variantAC} />
            </div>
          </>
        )}

        {/* ========== Operations Tab ========== */}
        {!loading && data && tab === "operations" && (
          <>
            {/* Hourly distribution */}
            <div className="mb-6 rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                活跃时段分布（近 30 天）
              </h2>
              <BarChart
                data={data.operations.hourlyDistribution.map((h) => ({
                  label: `${h.hour}时`,
                  value: h.count,
                }))}
              />
            </div>

            {/* Level distribution */}
            <div className="mb-6 rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-base font-semibold text-gray-900">GESP 目标级别分布</h2>
              <HorizontalBar
                items={data.operations.levelDistribution.map((l) => ({
                  label: `Level ${l.level}`,
                  value: l.count,
                }))}
                color="#8b5cf6"
              />
            </div>

            {/* Exam */}
            <StatCard
              label="设置考试日期用户"
              value={data.operations.examUsers}
              sub="已设置目标考试日期的用户数"
            />
          </>
        )}
      </main>
    </div>
  );
}
