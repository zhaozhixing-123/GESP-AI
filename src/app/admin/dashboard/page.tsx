"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

// ---- Types ----

interface FunnelStage {
  uv: number;
  signup: number;
  firstSubmit: number;
  paid: number;
}

interface P2Snapshot {
  active: number;
  denominator: number;
  ratio: number;
}

interface BasicTriple {
  yesterday: number;
  last7d: number;
  total: number;
}

interface BasicRatioTriple {
  yesterday: number;
  last7d: number;
  total: number;
}

interface BasicData {
  registered: BasicTriple;
  paid: BasicTriple;
  selfLearn: BasicTriple;
  paidConvRate: BasicRatioTriple;
  selfLearnConvRate: BasicRatioTriple;
  subscriptionTypes: { monthly: number; quarterly: number; yearly: number; internal: number };
  targetLevels: { level: number | null; count: number }[];
}

interface DashboardData {
  northStar: {
    p1: {
      current: number;
      target: number;
      net4w: number;
      wow: { lastSame: number; delta: number; deltaPct: number | null };
    };
    p2: {
      thisWeek: P2Snapshot;
      lastFullWeek: P2Snapshot;
      rolling4wRatio: number;
      wow: { lastSame: P2Snapshot; delta: number };
    };
    window: {
      weekStart: string;
      weekEnd: string;
      lastSameStart: string;
      lastSameEnd: string;
    };
  };
  funnel: {
    thisWeek: FunnelStage;
    lastSame: FunnelStage;
    rolling4w: FunnelStage;
  };
  levelDistribution: { level: number | null; paid: number; free: number }[];
  basic: BasicData;
}

type SilentBucket = "neverSubmitted" | "struggling" | "drifted" | "absent";

interface SilentUser {
  id: number;
  email: string;
  nickname: string;
  plan: string;
  planExpireAt: string | null;
  targetLevel: number | null;
  joinedAt: string;
  lastSubmissionAt: string | null;
  lastSubmissionStatus: string | null;
  lastVisitedThisWeekAt: string | null;
  weekAttempts: number;
  bucket: SilentBucket;
}

interface SilentResponse {
  users: SilentUser[];
  counts: Record<SilentBucket, number>;
  window: { start: string; end: string };
}

const PLAN_LABEL: Record<string, string> = {
  monthly: "月卡",
  quarterly: "季卡",
  yearly: "年卡",
};

const BUCKET_META: Record<SilentBucket, { label: string; color: string; hint: string }> = {
  struggling: {
    label: "挣扎中",
    color: "bg-amber-100 text-amber-800",
    hint: "本周有提交但都未过 → AI 私教/错因分析介入",
  },
  drifted: {
    label: "走神",
    color: "bg-blue-100 text-blue-800",
    hint: "本周访问过但没提交 → 拉回做题",
  },
  absent: {
    label: "缺席",
    color: "bg-red-100 text-red-800",
    hint: "本周没来过 → 流失警告，直接联系",
  },
  neverSubmitted: {
    label: "从未提交",
    color: "bg-gray-200 text-gray-700",
    hint: "买了没用 → 新手引导",
  },
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
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

// ---- P1 ----

function P1Card({ data }: { data: DashboardData["northStar"]["p1"] }) {
  const pct = Math.min(100, (data.current / data.target) * 100);
  const wowPctStr =
    data.wow.deltaPct === null
      ? "—"
      : `${data.wow.deltaPct >= 0 ? "+" : ""}${data.wow.deltaPct.toFixed(1)}%`;

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
          <p className="text-xs text-gray-500">4 周净增（辅助）</p>
          <p className="mt-1 text-sm text-gray-400">当前值 − 4 周前周一时点值</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${deltaColor(data.net4w)}`}>
            {fmtDelta(data.net4w)}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---- P2 ----

function P2Card({
  data,
  onShowSilent,
}: {
  data: DashboardData["northStar"]["p2"];
  onShowSilent: () => void;
}) {
  const { active, denominator, ratio } = data.thisWeek;
  const h = healthColor(ratio);
  const lastRatio = data.wow.lastSame.ratio;
  const ratioDelta = ratio - lastRatio;

  return (
    <section className={`rounded-2xl border ${h.border} ${h.bg} p-8 shadow-sm`}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${h.text}`}>P2 北极星</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">
            付费用户本周 AC ≥ 1 道 distinct 题
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            健康阈值：🟢 ≥ 30% · 🟡 15–30% · 🔴 &lt; 15% · 付费判定 = 周内任一时刻处于付费状态
          </p>
        </div>
        <div className="text-right">
          <div className={`text-6xl font-bold tabular-nums ${h.text}`}>
            {active}
            <span className="text-2xl font-normal text-gray-400"> / {denominator}</span>
          </div>
          <div className={`text-sm font-medium ${h.text}`}>
            {fmtPct(ratio)} · {h.label}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">WoW（本周至今 vs 上周同期）</p>
          <p className="mt-1 text-sm text-gray-400">
            上周同期 {data.wow.lastSame.active} / {data.wow.lastSame.denominator} ={" "}
            {fmtPct(lastRatio)}
          </p>
          <p
            className={`mt-1 text-xl font-bold tabular-nums ${deltaColor(data.wow.delta)}`}
          >
            {fmtDelta(data.wow.delta)}
            <span className={`ml-2 text-sm ${deltaColor(ratioDelta)}`}>
              ({ratioDelta >= 0 ? "+" : ""}
              {(ratioDelta * 100).toFixed(1)}pp)
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">上周完整周基线</p>
          <p className="mt-1 text-sm text-gray-400">
            {data.lastFullWeek.active} / {data.lastFullWeek.denominator}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
            {fmtPct(data.lastFullWeek.ratio)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
          <p className="text-xs text-gray-500">4 周滚动比例均值（辅助）</p>
          <p className="mt-1 text-sm text-gray-400">近 4 个完整周 ratio 均值</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
            {fmtPct(data.rolling4wRatio)}
          </p>
        </div>
      </div>

      <button
        onClick={onShowSilent}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50"
      >
        下钻：分类查看付费但本周未 AC 用户 →
      </button>
    </section>
  );
}

// ---- Funnel ----

function FunnelBar({
  title,
  subtitle,
  data,
  compare,
}: {
  title: string;
  subtitle: string;
  data: FunnelStage;
  compare?: FunnelStage;
}) {
  const steps: { key: keyof FunnelStage; label: string; hint: string }[] = [
    { key: "uv", label: "访问 UV", hint: "首次 page_view 落在窗口内的 anonymousId" },
    { key: "signup", label: "注册用户", hint: "cohort 中注册成真实用户的人" },
    { key: "firstSubmit", label: "提交用户", hint: "cohort 中做过任意提交的人" },
    { key: "paid", label: "付费用户", hint: "cohort 中最终付费的人" },
  ];
  const top = Math.max(data.uv, 1);

  return (
    <div className="rounded-lg bg-white p-5 ring-1 ring-gray-100">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>

      <div className="mt-4 space-y-3">
        {steps.map((step, idx) => {
          const v = data[step.key];
          const last = compare?.[step.key];
          const delta = last !== undefined ? v - last : null;
          const width = Math.max(3, (v / top) * 100);
          const convFromUv = data.uv > 0 ? (v / data.uv) * 100 : 0;

          return (
            <div key={step.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-gray-800">
                  {step.label}
                  <span className="ml-2 text-[11px] text-gray-400">{step.hint}</span>
                </span>
                <span className="tabular-nums">
                  <span className="font-bold text-gray-900">{v}</span>
                  {idx > 0 && (
                    <span className="ml-2 text-xs text-gray-400">({convFromUv.toFixed(1)}%)</span>
                  )}
                  {delta !== null && (
                    <span className={`ml-2 text-xs ${deltaColor(delta)}`}>{fmtDelta(delta)}</span>
                  )}
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded bg-gray-100">
                <div
                  className="h-6 rounded bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunnelCard({ data }: { data: DashboardData["funnel"] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">拉新 → 付费 队列漏斗（cohort）</h2>
      <p className="mt-1 text-xs text-gray-500">
        以首次 page_view 落在窗口内的 anonymousId 为锚，追踪他们之后的转化。转化率 =
        各步 / UV。注：近期 cohort 未完全成熟（用户可能还没来得及转化）。
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FunnelBar
          title="本周 cohort"
          subtitle="观测到现在（未成熟）"
          data={data.thisWeek}
          compare={data.lastSame}
        />
        <FunnelBar
          title="上周同期 cohort"
          subtitle="同等观测长度对比"
          data={data.lastSame}
        />
        <FunnelBar
          title="近 4 周 cohort"
          subtitle="本周之前 4 周新 UV，观测到现在（稳定基线）"
          data={data.rolling4w}
        />
      </div>
    </section>
  );
}

// ---- Level Distribution ----

function LevelCard({ data }: { data: DashboardData["levelDistribution"] }) {
  const totalPaid = data.reduce((a, b) => a + b.paid, 0);
  const totalFree = data.reduce((a, b) => a + b.free, 0);
  const max = Math.max(...data.map((d) => d.paid + d.free), 1);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">目标级别分布（付费 vs 免费）</h2>
          <p className="mt-1 text-xs text-gray-500">
            付费 {totalPaid} 人 · 免费 {totalFree} 人 · 每级 右侧数字为付费率
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-blue-600" />
            付费
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-gray-300" />
            免费
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {data.map((row, i) => {
          const total = row.paid + row.free;
          const paidPct = total > 0 ? (row.paid / total) * 100 : 0;
          const paidW = (row.paid / max) * 100;
          const freeW = (row.free / max) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="w-12 text-right text-sm text-gray-600">
                {row.level === null ? "未填" : `${row.level} 级`}
              </span>
              <div className="relative flex h-6 flex-1 overflow-hidden rounded bg-gray-100">
                <div className="h-6 bg-blue-600" style={{ width: `${paidW}%` }} />
                <div className="h-6 bg-gray-300" style={{ width: `${freeW}%` }} />
              </div>
              <span className="w-36 text-right text-xs tabular-nums text-gray-700">
                {row.paid} / {total}
                <span
                  className={`ml-2 font-medium ${paidPct >= 20 ? "text-green-600" : paidPct >= 5 ? "text-amber-600" : "text-gray-400"}`}
                >
                  {paidPct.toFixed(1)}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Silent Users Modal ----

function SilentUsersModal({ onClose }: { onClose: () => void }) {
  const [resp, setResp] = useState<SilentResponse | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<SilentBucket | "all">("all");

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/admin/paid-silent-users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("加载失败");
        return r.json();
      })
      .then((d) => setResp(d))
      .catch((e) => setErr(e.message));
  }, []);

  const visible = resp?.users.filter((u) => filter === "all" || u.bucket === filter) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">付费但本周未 AC 用户</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {resp && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50 px-6 py-3">
            <BucketChip
              active={filter === "all"}
              label="全部"
              count={resp.users.length}
              color="bg-gray-700 text-white"
              onClick={() => setFilter("all")}
            />
            {(Object.keys(BUCKET_META) as SilentBucket[]).map((b) => (
              <BucketChip
                key={b}
                active={filter === b}
                label={BUCKET_META[b].label}
                count={resp.counts[b]}
                color={BUCKET_META[b].color}
                onClick={() => setFilter(b)}
              />
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {err && <p className="p-6 text-sm text-red-600">{err}</p>}
          {!resp && !err && <p className="p-6 text-sm text-gray-500">加载中…</p>}
          {resp && resp.users.length === 0 && (
            <p className="p-6 text-sm text-gray-500">本周所有付费用户都至少 AC 了一道题 🎉</p>
          )}
          {visible.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">用户</th>
                  <th className="px-4 py-3 text-left">分类</th>
                  <th className="px-4 py-3 text-left">套餐</th>
                  <th className="px-4 py-3 text-left">级别</th>
                  <th className="px-4 py-3 text-left">本周尝试</th>
                  <th className="px-4 py-3 text-left">最近提交</th>
                  <th className="px-4 py-3 text-left">本周最后访问</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((u) => {
                  const lastSubDays = daysBetween(u.lastSubmissionAt);
                  const meta = BUCKET_META[u.bucket];
                  return (
                    <tr key={u.id} className="hover:bg-gray-50" title={meta.hint}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.nickname}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {PLAN_LABEL[u.plan] ?? u.plan}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {u.targetLevel ? `${u.targetLevel} 级` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 tabular-nums">
                        {u.weekAttempts === 0 ? (
                          <span className="text-gray-400">无</span>
                        ) : (
                          <span>
                            {u.weekAttempts} 次 · 最近{" "}
                            <StatusBadge status={u.lastSubmissionStatus ?? ""} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.lastSubmissionAt ? (
                          <span className={lastSubDays !== null && lastSubDays > 7 ? "text-red-600" : "text-gray-700"}>
                            {lastSubDays === 0 ? "今天" : `${lastSubDays} 天前`}
                            {u.lastSubmissionStatus && (
                              <span className="ml-1">
                                <StatusBadge status={u.lastSubmissionStatus} />
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">从未提交</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {u.lastVisitedThisWeekAt ? (
                          <span>{new Date(u.lastVisitedThisWeekAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        ) : (
                          <span className="text-gray-400">本周未来</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {resp && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-500">
            共 {visible.length} 人 · 点击分类筛选 ·
            建议优先处理「挣扎中」（有尝试但做不出，最可救援）
          </div>
        )}
      </div>
    </div>
  );
}

function BucketChip({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? `${color} shadow` : "bg-white text-gray-600 ring-1 ring-gray-200"
      }`}
    >
      {label} <span className="ml-1 tabular-nums">{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    AC: "text-green-700",
    WA: "text-red-700",
    TLE: "text-orange-700",
    CE: "text-purple-700",
    RE: "text-pink-700",
    MLE: "text-amber-700",
  };
  return <span className={`font-medium ${map[status] ?? "text-gray-600"}`}>{status || "—"}</span>;
}

// ---- Basic Data TAB ----

/** 带 ! tooltip 的标签。hover 时显示 hint */
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

/** 单个指标卡：标题 + ! + 三列（昨日 / 过去7天 / 历史累计）并排 */
function TripleCard({
  title,
  hint,
  triple,
  formatter = (n: number) => n.toLocaleString("zh-CN"),
  valueClass = "text-gray-900",
}: {
  title: string;
  hint: string;
  triple: { yesterday: number; last7d: number; total: number };
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

function BasicTab({ data }: { data: BasicData }) {
  const fmtPctLocal = (r: number) =>
    `${(r * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      {/* 核心指标概览 */}
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

      {/* 付费用户类型分布 */}
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

      {/* 注册用户目标级别分布 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">
          <InfoLabel text="注册用户目标级别分布" hint={METRIC_HINTS.targetLevel} />
        </h3>
        <TargetLevelChart rows={data.targetLevels} />
      </section>
    </div>
  );
}

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

// ---- Page ----

type TabKey = "basic" | "northStar";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSilent, setShowSilent] = useState(false);
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
    { key: "northStar", label: "北极星指标" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">数据看板</h1>
          <p className="mt-1 text-sm text-gray-500">
            已剔除内部账号与管理员。面板不缓存，刷新即时生效。指标字段旁的{" "}
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
              !
            </span>{" "}
            悬停可查看定义。
          </p>
        </div>

        <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-500">加载中…</p>}
        {error && <p className="text-sm text-red-600">加载失败：{error}</p>}

        {data && tab === "basic" && <BasicTab data={data.basic} />}

        {data && tab === "northStar" && (
          <div className="space-y-6">
            <P1Card data={data.northStar.p1} />
            <P2Card data={data.northStar.p2} onShowSilent={() => setShowSilent(true)} />
            <FunnelCard data={data.funnel} />
            <LevelCard data={data.levelDistribution} />

            <p className="pt-2 text-center text-xs text-gray-400">
              数据窗口：{new Date(data.northStar.window.weekStart).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} —{" "}
              {new Date(data.northStar.window.weekEnd).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
            </p>
          </div>
        )}

        {showSilent && <SilentUsersModal onClose={() => setShowSilent(false)} />}
      </main>
    </div>
  );
}
