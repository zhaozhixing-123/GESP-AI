"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

// ---- Types ----

interface BasicTriple {
  yesterday: number;
  last7d: number;
  total: number;
}

interface BasicData {
  registered: BasicTriple;
  paid: BasicTriple;
  selfLearn: BasicTriple;
  paidConvRate: BasicTriple;
  selfLearnConvRate: BasicTriple;
  subscriptionTypes: { monthly: number; quarterly: number; yearly: number; internal: number };
  targetLevels: { level: number | null; count: number }[];
}

interface DashboardData {
  basic: BasicData;
}

// ---- Basic Data ----

function InfoLabel({ text, hint }: { text: string; hint: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{text}</span>
      <span
        tabIndex={0}
        aria-label={hint}
        title={hint}
        className="inline-flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 hover:bg-blue-100 hover:text-blue-700"
      >
        !
      </span>
    </span>
  );
}

function TripleCard({
  title,
  hint,
  triple,
  formatter = (n: number) => n.toLocaleString("zh-CN"),
  valueClass = "text-gray-900",
}: {
  title: string;
  hint: string;
  triple: BasicTriple;
  formatter?: (n: number) => string;
  valueClass?: string;
}) {
  const cells = [
    { label: "昨日", value: triple.yesterday },
    { label: "过去 7 天", value: triple.last7d },
    { label: "历史累计", value: triple.total },
  ];
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900">
        <InfoLabel text={title} hint={hint} />
      </h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-gray-50 px-3 py-3 text-center">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
              {formatter(c.value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const METRIC_HINTS = {
  registered:
    "平台上已完成注册、非管理员、非内部赠阅账号。「昨日」指自然日新注册人数（Asia/Shanghai 00:00–24:00）；「过去 7 天」指现在往前推 7×24 小时内新注册人数；「历史累计」是平台全部真实注册用户数。",
  paid:
    "期内有过「paid」状态订单的真实用户去重计数。「昨日」= 昨日自然日内 paidAt 落入的 distinct 用户；「过去 7 天」= 近 7×24h；「历史累计」= 所有曾付过款的用户去重数。不含内部赠阅与管理员。",
  selfLearn:
    "付费用户且至少 AC 过一道题（提交状态为 AC）。分子限定付费订单落在对应窗口内，AC 记录时间不限。反映付费后真正开始自学的人群规模。",
  paidConv:
    "付费用户数 ÷ 注册用户数。衡量注册漏斗末端：每 100 个新注册里最终付费的比例（同窗口内）。",
  selfLearnConv:
    "自学用户数 ÷ 付费用户数。衡量付费后激活：付费用户中真正开始学习（AC ≥ 1 题）的比例。",
  subTypes:
    "当前时点有效付费订阅的套餐构成。月度 / 季度 / 年度统计 plan≠free 且 planExpireAt 未过期的真实用户。内部赠阅 = isInternal=true 的账号（通常是团队内部测试/免费赠送）。",
  targetLevel:
    "注册用户的目标考试级别分布（字段 targetLevel，1–8 级）。未填 = 用户注册时未选择目标级别。已剔除内部与管理员。",
} as const;

function TargetLevelChart({ rows }: { rows: { level: number | null; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="mt-4 space-y-2">
      {rows.map((r) => {
        const label = r.level === null ? "未填" : `${r.level} 级`;
        const width = (r.count / max) * 100;
        return (
          <div key={r.level ?? "null"} className="flex items-center gap-3">
            <span className="w-14 text-right text-sm text-gray-600">{label}</span>
            <div className="relative flex h-6 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className={`h-6 rounded ${r.level === null ? "bg-gray-400" : "bg-blue-600"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-16 text-right text-sm font-medium tabular-nums text-gray-700">
              {r.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BasicTab({ data }: { data: BasicData }) {
  const fmtPctLocal = (r: number) => `${(r * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TripleCard
          title="注册用户数"
          hint={METRIC_HINTS.registered}
          triple={data.registered}
          valueClass="text-blue-700"
        />
        <TripleCard
          title="付费用户数"
          hint={METRIC_HINTS.paid}
          triple={data.paid}
          valueClass="text-emerald-700"
        />
        <TripleCard
          title="自学用户数"
          hint={METRIC_HINTS.selfLearn}
          triple={data.selfLearn}
          valueClass="text-violet-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TripleCard
          title="付费转化率"
          hint={METRIC_HINTS.paidConv}
          triple={data.paidConvRate}
          formatter={fmtPctLocal}
          valueClass="text-emerald-700"
        />
        <TripleCard
          title="自学转化率"
          hint={METRIC_HINTS.selfLearnConv}
          triple={data.selfLearnConvRate}
          formatter={fmtPctLocal}
          valueClass="text-violet-700"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">
          <InfoLabel text="付费用户类型分布" hint={METRIC_HINTS.subTypes} />
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { k: "monthly", label: "月度订阅总数", v: data.subscriptionTypes.monthly, c: "text-blue-700" },
            { k: "quarterly", label: "季度订阅总数", v: data.subscriptionTypes.quarterly, c: "text-indigo-700" },
            { k: "yearly", label: "年度订阅总数", v: data.subscriptionTypes.yearly, c: "text-emerald-700" },
            { k: "internal", label: "内部赠阅总数", v: data.subscriptionTypes.internal, c: "text-amber-700" },
          ].map((row) => (
            <div key={row.k} className="rounded-lg bg-gray-50 px-3 py-4 text-center">
              <p className="text-xs text-gray-500">{row.label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${row.c}`}>
                {row.v.toLocaleString("zh-CN")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">
          <InfoLabel text="注册用户目标级别分布" hint={METRIC_HINTS.targetLevel} />
        </h3>
        <TargetLevelChart rows={data.targetLevels} />
      </section>
    </div>
  );
}

// ---- Page ----

export default function DashboardPage() {
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">基础数据</h1>
          <p className="mt-1 text-sm text-gray-500">
            已剔除内部账号与管理员。面板不缓存，刷新即时生效。指标字段旁的{" "}
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
              !
            </span>{" "}
            悬停可查看定义。
          </p>
        </div>

        {loading && <p className="text-sm text-gray-500">加载中…</p>}
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}

        {data && <BasicTab data={data.basic} />}
      </main>
    </div>
  );
}
