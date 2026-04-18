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
  revenue: BasicTriple;
  paidConvRate: BasicTriple;
  selfLearnConvRate: BasicTriple;
  subscriptionTypes: { monthly: number; quarterly: number; yearly: number; internal: number };
  targetLevels: { level: number | null; count: number }[];
}

interface LlmPurposeRow {
  purpose: string;
  label: string;
  calls: number;
  tokens: number;
  costCny: number;
}

interface LlmData {
  calls: BasicTriple;
  successRate: BasicTriple;
  tokens: BasicTriple;
  costCny: BasicTriple;
  breakdown: {
    yesterday: LlmPurposeRow[];
    last7d: LlmPurposeRow[];
    total: LlmPurposeRow[];
  };
  statsStartDate: string | null;
  usdToCny: number;
}

interface DashboardData {
  basic: BasicData;
  llm: LlmData;
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
  revenue:
    "期内 status=paid 订单的 amount 总和（分→元）。昨日 = 昨日自然日 paidAt 落入的订单金额；过去 7 天 = 近 7×24h；历史累计 = 所有真付费订单总和。不含内部赠阅与管理员。",
  paidConv:
    "付费用户数 ÷ 注册用户数。衡量注册漏斗末端：每 100 个新注册里最终付费的比例（同窗口内）。",
  selfLearnConv:
    "自学用户数 ÷ 付费用户数。衡量付费后激活：付费用户中真正开始学习（AC ≥ 1 题）的比例。",
  subTypes:
    "当前时点有效订阅的套餐构成（快照）。月度 / 季度 / 年度只统计「真付费」——存在 status=paid 订单的未过期订阅用户。内部赠阅 = isInternal=true 账号 + admin 后台手动设置订阅（plan≠free 未过期但无 paid 订单）的用户之和。",
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

      <TripleCard
        title="收入（元）"
        hint={METRIC_HINTS.revenue}
        triple={data.revenue}
        formatter={(n) =>
          n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }
        valueClass="text-amber-700"
      />

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

// ---- LLM Cost ----

const LLM_HINTS = {
  calls:
    "调用大模型的总次数（含成功与失败）。昨日 = 昨日自然日（Asia/Shanghai）落入的调用；过去 7 天 = 近 7×24h；历史累计 = 埋点上线至今全部调用。",
  successRate:
    "成功调用占比。失败原因通常是网络超时、模型报错或参数异常。",
  tokens:
    "input / output / cache_read / cache_write 所有类型 token 的加总，反映总消耗体量。",
  costCny:
    "按 Anthropic 官方定价（per MTok）对每次调用按实际模型分别估算，再以汇率 ¥/$ 折算为人民币。cache_read 按输入价 10% 计，5 分钟写缓存 1.25×、1 小时写缓存 2×。",
  breakdown:
    "按用途拆分：聊天、错题分析、模拟考试诊断、测试点生成 / 复核、变形题生成 / 复核、自动打标。",
} as const;

function fmtInt(n: number): string {
  return n.toLocaleString("zh-CN");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtCny(n: number): string {
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type RangeKey = "yesterday" | "last7d" | "total";

function LlmBreakdownTable({
  rows,
  rangeLabel,
}: {
  rows: LlmPurposeRow[];
  rangeLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">{rangeLabel}暂无调用记录。</p>
    );
  }
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  const totalCost = rows.reduce((s, r) => s + r.costCny, 0);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2">用途分类</th>
            <th className="px-3 py-2 text-right">调用次数</th>
            <th className="px-3 py-2 text-right">TOKEN 消耗</th>
            <th className="px-3 py-2 text-right">预估费用</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.purpose} className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-900">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                {fmtInt(r.calls)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                {fmtInt(r.tokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700">
                {fmtCny(r.costCny)}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-3 py-2 text-gray-900">合计</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {fmtInt(totalCalls)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {fmtInt(totalTokens)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-amber-700">
              {fmtCny(totalCost)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LlmTab({ data }: { data: LlmData }) {
  const [range, setRange] = useState<RangeKey>("last7d");

  const rangeLabels: Record<RangeKey, string> = {
    yesterday: "昨日",
    last7d: "过去 7 天",
    total: "历史累计",
  };

  const rows = data.breakdown[range];
  const startDateText = data.statsStartDate
    ? new Date(data.statsStartDate).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "暂无数据";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TripleCard
          title="总调用次数"
          hint={LLM_HINTS.calls}
          triple={data.calls}
          valueClass="text-blue-700"
        />
        <TripleCard
          title="成功率"
          hint={LLM_HINTS.successRate}
          triple={data.successRate}
          formatter={fmtPct}
          valueClass="text-emerald-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TripleCard
          title="TOKEN 消耗"
          hint={LLM_HINTS.tokens}
          triple={data.tokens}
          valueClass="text-violet-700"
        />
        <TripleCard
          title="预估费用"
          hint={LLM_HINTS.costCny}
          triple={data.costCny}
          formatter={fmtCny}
          valueClass="text-amber-700"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">
            <InfoLabel text="按用途拆分" hint={LLM_HINTS.breakdown} />
          </h3>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs">
            {(Object.keys(rangeLabels) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  range === k
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {rangeLabels[k]}
              </button>
            ))}
          </div>
        </div>
        <LlmBreakdownTable rows={rows} rangeLabel={rangeLabels[range]} />
      </section>

      <p className="text-xs text-gray-500">
        费用按 Anthropic 官方 per-MTok 价格估算（汇率 ¥{data.usdToCny} / $1，写死）。
        历史累计仅涵盖埋点上线后的调用，统计起点：{startDateText}。
      </p>
    </div>
  );
}

// ---- Page ----

type TabKey = "basic" | "llm";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("basic");

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: "basic", label: "基础数据" },
    { key: "llm", label: "大模型成本" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-500">加载中…</p>}
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}

        {data && tab === "basic" && <BasicTab data={data.basic} />}
        {data && tab === "llm" && <LlmTab data={data.llm} />}
      </main>
    </div>
  );
}
