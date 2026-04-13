"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── 数据（可随时更新） ────────────────────────────────────────────────────────
const STATS = [
  { value: "200+", label: "道历年真题" },
  { value: "800+", label: "道 AI 变形题" },
  { value: "1-8", label: "级全部覆盖" },
];

const PLANS = [
  {
    id: "monthly",
    name: "月度",
    price: 99,
    unit: "/ 月",
    perMonth: null,
    highlight: false,
    desc: "灵活体验，随时开始",
  },
  {
    id: "quarterly",
    name: "季度",
    price: 199,
    unit: "/ 季",
    perMonth: "约 ¥66 / 月",
    highlight: true,
    desc: "最受欢迎，备考首选",
  },
  {
    id: "yearly",
    name: "年度",
    price: 599,
    unit: "/ 年",
    perMonth: "约 ¥49 / 月",
    highlight: false,
    desc: "长期备考，最划算",
  },
];

// ─── 组件 ──────────────────────────────────────────────────────────────────────

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400">
      {children}
    </span>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("token")) {
      router.replace("/problems");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      {/* 全局网格背景 */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#080810]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight">
            <GradientText>GESP.AI</GradientText>
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-4 py-1.5 text-sm text-gray-400 transition hover:text-white"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
            >
              免费开始
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20 text-center">
        {/* 光晕 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute left-1/3 top-1/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[80px]" />

        <div className="relative z-10 max-w-4xl">
          <SectionTag>专为 GESP 竞赛设计的 AI 学习平台</SectionTag>

          <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight md:text-7xl">
            考过 GESP，
            <br />
            <GradientText>不只是背题</GradientText>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            真题刷题 × AI 引导思考 × 变形题巩固
            <br />
            从「做错」到「真懂」的完整闭环
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="rounded-xl bg-violet-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500 hover:shadow-violet-500/40"
            >
              免费开始体验
            </Link>
            <button
              onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl border border-white/15 px-8 py-3 text-base font-medium text-gray-300 transition hover:border-white/30 hover:text-white"
            >
              了解更多
            </button>
          </div>

          <p className="mt-4 text-sm text-gray-600">免费体验 1 道完整题目，无需信用卡</p>
        </div>

        {/* 向下箭头 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-gray-600">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </section>

      {/* ── 创始人故事 ──────────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <Card className="relative overflow-hidden">
            {/* 装饰性光晕 */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-600/20 blur-[60px]" />
            <div className="relative z-10">
              <div className="mb-4 text-3xl">💬</div>
              <blockquote className="text-xl font-medium leading-relaxed text-gray-100 md:text-2xl">
                "我是一名五年级小学生，备考 GESP 时请了私教，但费用太贵。
                于是我决定自己开发一个 AI 平台。用这个产品备考后，
                <span className="text-violet-400">我通过了 GESP 五级</span>
                ——成了第一个验证它有效的用户。"
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-bold">
                  G
                </div>
                <div>
                  <div className="text-sm font-medium text-white">GESP.AI 创始人</div>
                  <div className="text-xs text-gray-500">小学五年级 · GESP 五级认证</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ── 痛点 ────────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <SectionTag>你是否也遇到这些问题</SectionTag>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "💸",
                title: "私教太贵",
                desc: "一对一辅导动辄数百元 / 小时，长期备考费用难以承受",
              },
              {
                icon: "😰",
                title: "背题不管用",
                desc: "题目换个情境就不会了，考试遇到新题型直接懵",
              },
              {
                icon: "🌫️",
                title: "不知盲点在哪",
                desc: "题做对了，但不知道是真懂还是碰巧蒙对，心里没底",
              },
            ].map((item) => (
              <Card key={item.title}>
                <div className="mb-3 text-2xl">{item.icon}</div>
                <h3 className="mb-2 font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────────── */}
      <section ref={featuresRef} className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 text-center">
            <SectionTag>产品逻辑</SectionTag>
          </div>
          <h2 className="mb-16 text-center text-3xl font-bold md:text-4xl">
            三步完成从做题到<GradientText>真正掌握</GradientText>
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "做真题",
                desc: "完整的 GESP 历年真题题库，在线写代码提交，即时判题，覆盖 1-8 级。",
                icon: "📝",
              },
              {
                step: "02",
                title: "做错解锁变形题",
                desc: "做错后自动解锁 AI 生成的同知识点变形题，换情境再练，确认真正掌握。",
                icon: "🔓",
              },
              {
                step: "03",
                title: "AI 老师引导突破",
                desc: "遇到卡壳，AI 老师用启发式对话引导你自己想明白，不会直接给答案。",
                icon: "🤖",
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {/* 连接线 */}
                {i < 2 && (
                  <div className="absolute -right-3 top-8 hidden h-0.5 w-6 bg-gradient-to-r from-violet-500/50 to-transparent md:block" />
                )}
                <Card className="h-full">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-xs font-mono font-bold text-violet-400">{item.step}</span>
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{item.desc}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 核心功能 ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 text-center">
            <SectionTag>核心功能</SectionTag>
          </div>
          <h2 className="mb-16 text-center text-3xl font-bold md:text-4xl">
            每个功能都为<GradientText>真正学会</GradientText>而设计
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: "🔄",
                title: "变形题系统",
                badge: "独家",
                desc: "每道真题配套 4 道 AI 生成的变形题，做错才解锁，换情境再练，防止蒙对就跳过。",
              },
              {
                icon: "🧑‍🏫",
                title: "AI 老师",
                badge: "Claude 驱动",
                desc: "不直接给答案，用苏格拉底式对话引导你自己思考，问题越问越明白。",
              },
              {
                icon: "📚",
                title: "错题本",
                desc: "做错的题自动收录，附 AI 错因分析。分级复习，精准攻克薄弱知识点。",
              },
            ].map((item) => (
              <Card key={item.title} className="group transition hover:border-violet-500/30 hover:bg-violet-500/5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-3xl">{item.icon}</span>
                  {item.badge && (
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-400">
                      {item.badge}
                    </span>
                  )}
                </div>
                <h3 className="mb-3 text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 数字背书 ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-blue-500/10 p-8">
            <div className="grid grid-cols-3 divide-x divide-white/10">
              {STATS.map((s) => (
                <div key={s.label} className="px-6 text-center">
                  <div className="text-3xl font-bold text-white md:text-4xl">
                    <GradientText>{s.value}</GradientText>
                  </div>
                  <div className="mt-1 text-sm text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 定价 ────────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 text-center">
            <SectionTag>价格透明</SectionTag>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            比私教省 <GradientText>97%</GradientText>
          </h2>
          <p className="mb-16 text-center text-gray-400">
            私教一对一辅导约 ¥200–500 / 小时，一个月备考少说 ¥2000+
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {/* 免费版 */}
            <Card className="flex flex-col">
              <div className="mb-1 text-sm text-gray-400">免费体验</div>
              <div className="mb-1 text-3xl font-bold text-white">¥0</div>
              <div className="mb-6 text-xs text-gray-500">永久免费</div>
              <ul className="mb-8 flex-1 space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> 1 道完整真题</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> AI 老师答疑</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> 变形题解锁</li>
              </ul>
              <Link
                href="/register"
                className="block rounded-xl border border-white/15 py-2.5 text-center text-sm font-medium text-gray-300 transition hover:border-white/30 hover:text-white"
              >
                免费开始
              </Link>
            </Card>

            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={`flex flex-col ${plan.highlight ? "border-violet-500/50 bg-violet-500/10" : ""}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm text-gray-400">{plan.name}</span>
                  {plan.highlight && (
                    <span className="rounded-full bg-violet-500 px-2 py-0.5 text-xs font-medium text-white">
                      推荐
                    </span>
                  )}
                </div>
                <div className="mb-1 flex items-end gap-1">
                  <span className="text-3xl font-bold text-white">¥{plan.price}</span>
                  <span className="mb-1 text-sm text-gray-500">{plan.unit}</span>
                </div>
                {plan.perMonth && (
                  <div className="mb-1 text-xs text-gray-500">{plan.perMonth}</div>
                )}
                <div className="mb-6 text-xs text-gray-500">{plan.desc}</div>
                <ul className="mb-8 flex-1 space-y-2 text-sm text-gray-400">
                  <li className="flex items-center gap-2"><span className="text-green-400">✓</span> 全部真题无限刷</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">✓</span> AI 老师无限对话</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">✓</span> 全部变形题解锁</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">✓</span> 错题本 + AI 错因分析</li>
                </ul>
                <Link
                  href="/register"
                  className={`block rounded-xl py-2.5 text-center text-sm font-medium transition ${
                    plan.highlight
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500"
                      : "border border-white/15 text-gray-300 hover:border-white/30 hover:text-white"
                  }`}
                >
                  立即订阅
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 最终 CTA ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-32 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/15 blur-[100px]" />
        <div className="relative z-10 mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold md:text-5xl">
            现在开始，<GradientText>真正掌握算法</GradientText>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-gray-400">
            免费体验 1 道完整题目，包括 AI 老师和变形题
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-xl bg-violet-600 px-10 py-4 text-base font-semibold text-white shadow-xl shadow-violet-600/30 transition hover:bg-violet-500"
          >
            免费开始体验
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-6 py-8 text-center text-sm text-gray-600">
        <div className="mb-2 font-medium text-gray-500">
          <GradientText>GESP.AI</GradientText>
        </div>
        <div className="flex justify-center gap-6">
          <Link href="/login" className="hover:text-gray-400">登录</Link>
          <Link href="/register" className="hover:text-gray-400">注册</Link>
          <Link href="/problems" className="hover:text-gray-400">题库</Link>
        </div>
      </footer>
    </div>
  );
}
