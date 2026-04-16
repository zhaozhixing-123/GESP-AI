"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const REGISTER_URL = "/register";

const CHAT_MESSAGES = [
  { role: "student" as const, text: "老师，这道题我用了循环但一直输出错误答案\u2026" },
  { role: "ai" as const, text: "我看到你的循环了。你觉得循环的终止条件对吗？当 i 等于 n 的时候，循环还会执行吗？" },
  { role: "student" as const, text: "嗯\u2026i 等于 n 的时候应该不执行了？" },
  { role: "ai" as const, text: "对，那你再看看你写的条件 i <= n，当 i 等于 n 的时候会发生什么？" },
  { role: "student" as const, text: "啊！多算了一次！应该是 i < n！" },
  { role: "ai" as const, text: "完全正确 \ud83d\udc4f 边界条件是最容易出错的地方。改好之后再运行试试？" },
];

const PLANS = [
  { id: "monthly", name: "月卡", price: 99, unit: "/月", perMonth: "¥99/月", desc: "灵活体验", highlight: false },
  { id: "quarterly", name: "季卡", price: 199, unit: "/季", perMonth: "约¥66/月", desc: "备考周期首选", highlight: true },
  { id: "yearly", name: "年卡", price: 599, unit: "/年", perMonth: "约¥49/月", desc: "长期最划算", highlight: false },
];

const FEATURES = [
  "全部真题无限刷",
  "AI 私教无限对话",
  "全部变形题解锁",
  "AI 错因分析",
  "模拟考试 + AI 诊断报告",
  "专注力追踪 + 家长通知",
];

const COMPARISONS = [
  {
    now: ["卡住了", "搜答案", "通过了，但没学会"],
    ai: ["卡住了", "AI 问他一个问题", "他自己想通了"],
    aiHighlight: "AI 问他一个问题",
  },
  {
    now: ["做错了", "不知道为什么", "下次还错"],
    ai: ["做错了", "AI 分析错因 + 变形题再练", "这个坑填上了"],
    aiHighlight: "AI 分析错因 + 变形题再练",
  },
  {
    now: ["刷题", "不知道练什么", "大量时间花在已经会的题上"],
    ai: ["基于孩子的数据", "每道题都是他最需要练的"],
    aiHighlight: "基于孩子的数据",
  },
];

// ─── 滚动渐入 Hook ────────────────────────────────────────────────────────────

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, className: `transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}` };
}

// ─── AI 对话演示组件 ──────────────────────────────────────────────────────────

function ChatDemo() {
  const [messages, setMessages] = useState<typeof CHAT_MESSAGES>([]);
  const [typing, setTyping] = useState(false);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) { setStarted(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  const playSequence = useCallback(async () => {
    setMessages([]);
    setTyping(false);

    for (let i = 0; i < CHAT_MESSAGES.length; i++) {
      const msg = CHAT_MESSAGES[i];
      if (msg.role === "ai") {
        setTyping(true);
        await sleep(1500 + Math.random() * 500);
        setTyping(false);
      } else {
        await sleep(800);
      }
      setMessages((prev) => [...prev, msg]);
      await sleep(300);
    }
    await sleep(3500);
  }, []);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        await playSequence();
      }
    })();
    return () => { cancelled = true; };
  }, [started, playSequence]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, typing]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-[#111827] shadow-2xl overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-[#34d399]" />
          <span className="text-sm text-gray-400">AI 私教在线</span>
          <span className="text-xs text-gray-600 ml-auto font-mono">晚上 9:47</span>
        </div>
        {/* 消息区 */}
        <div ref={scrollRef} className="h-[340px] overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "student"
                    ? "bg-[#1d5bd6] text-white rounded-br-md"
                    : "bg-white/10 text-gray-200 rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white/10 px-4 py-3 flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-500">真实对话示例</p>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("quarterly");

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("token")) {
      router.replace("/problems");
    }
  }, [router]);

  const fadeCompare = useFadeIn();
  const fadeAiDemo = useFadeIn();
  const fadeQuote = useFadeIn();
  const fadeError = useFadeIn();
  const fadeParent = useFadeIn();
  const fadePricing = useFadeIn();
  const fadeCta = useFadeIn();

  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#0c1524]" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>

      {/* ── 导航栏 ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-[#e8e4db] bg-[#f7f5f0]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="text-lg font-bold tracking-tight text-[#1d5bd6]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
            GESP.AI
          </span>
          <Link
            href={REGISTER_URL}
            className="rounded-lg bg-[#1d5bd6] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1550b8] hover:-translate-y-0.5 hover:shadow-lg"
          >
            开始使用
          </Link>
        </div>
      </nav>

      {/* ── 第一屏 Hero ─────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center overflow-hidden">
        {/* 背景：淡蓝径向渐变 + 网点 */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(29,91,214,0.06)_0%,transparent_70%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, #0c1524 0.8px, transparent 0.8px)", backgroundSize: "20px 20px" }}
        />

        <div className="relative z-10 max-w-[720px]">
          {/* pill badge */}
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d5bd6]/20 bg-[#1d5bd6]/5 px-4 py-1.5 text-xs font-medium text-[#1d5bd6]">
            <span className="h-2 w-2 rounded-full bg-[#34d399]" />
            创始人：赵知行，小学五年级
          </span>

          {/* 产品名 */}
          <p className="mt-6 text-lg font-bold text-[#1d5bd6] sm:text-xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
            GESP AI 私教
          </p>

          {/* 主标题 */}
          <h1
            className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-black leading-tight tracking-tight"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            告别题海，自学成才
          </h1>

          {/* 三短句 */}
          <p className="mx-auto mt-6 max-w-xl text-[clamp(0.875rem,2vw,1.0625rem)] leading-relaxed text-[#666]">
            不给答案，引导孩子自己想通 · 基于孩子的数据个性化训练 · 24小时在线
          </p>

          {/* 数据条 */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-medium text-[#1d5bd6]">
            <span>200+ 真题</span>
            <span className="text-[#ccc]">·</span>
            <span>800+ AI 变形题</span>
            <span className="text-[#ccc]">·</span>
            <span>1-8 级全覆盖</span>
          </div>

          {/* CTA */}
          <div className="mt-10">
            <Link
              href={REGISTER_URL}
              className="inline-block rounded-xl bg-[#1d5bd6] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1d5bd6]/20 transition hover:bg-[#1550b8] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#1d5bd6]/30"
            >
              开始使用
            </Link>
            <p className="mt-4">
              <Link href="/story" className="text-sm text-[#1d5bd6] hover:underline">
                了解赵知行的故事 →
              </Link>
            </p>
          </div>
        </div>

        {/* 向下滚动提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[#aaa] animate-bounce">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs">往下看</span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── 第二屏 创始人原话 ───────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-12 md:py-16">
        <div className="mx-auto max-w-[640px] text-center">
          <div ref={fadeQuote.ref} className={fadeQuote.className}>
            <blockquote
              className="text-xl leading-relaxed text-[#333] sm:text-2xl"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              &ldquo;效率提升了5到10倍。原来一道题卡住就会浪费很多时间和情绪，会感到烦躁和无助。现在少走很多弯路。&rdquo;
            </blockquote>
            <p className="mt-6 text-sm text-[#999]">
              赵知行，GESP.AI 创始人 · 小学五年级
            </p>
          </div>
        </div>
      </section>

      {/* ── 第三屏 对比 ─────────────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-[72px]">
        <div className="mx-auto max-w-[760px]">
          <div ref={fadeCompare.ref} className={fadeCompare.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              告别题海
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              你的孩子现在怎么练题？
            </h2>
          </div>

          <div className="mt-10 space-y-5">
            {COMPARISONS.map((c, i) => (
              <div key={i} className="rounded-xl border border-[#e8e4db] bg-white p-5 md:p-6">
                <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                  {/* 现在 */}
                  <div>
                    <span className="mb-2 inline-block rounded bg-[#f0eeea] px-2 py-0.5 text-xs font-medium text-[#999]">现在</span>
                    <div className="space-y-1 text-sm leading-relaxed text-[#666]">
                      {c.now.map((step, j) => (
                        <p key={j}>{j > 0 && <span className="mr-1 text-[#ccc]">↓</span>}{step}</p>
                      ))}
                    </div>
                  </div>
                  {/* AI 私教 */}
                  <div>
                    <span className="mb-2 inline-block rounded bg-[#1d5bd6]/10 px-2 py-0.5 text-xs font-medium text-[#1d5bd6]">AI 私教</span>
                    <div className="space-y-1 text-sm leading-relaxed text-[#333]">
                      {c.ai.map((step, j) => (
                        <p key={j}>
                          {j > 0 && <span className="mr-1 text-[#ccc]">↓</span>}
                          {step === c.aiHighlight ? <strong className="text-[#1d5bd6]">{step}</strong> : step}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 第四屏 AI 私教演示 ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#0c1524] to-[#111d30] px-6 py-[72px]">
        <div className="mx-auto max-w-[960px]">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
            {/* 左：文案 */}
            <div ref={fadeAiDemo.ref} className={fadeAiDemo.className}>
              <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#4a7fe8]">
                自学成才
              </span>

              <h2 className="mt-6 text-2xl font-bold text-white sm:text-3xl md:text-4xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                只提示启发
                <br />
                不给答案
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-gray-400">
                孩子卡住的时候发一条消息。AI 私教不会直接给答案——它会问孩子一个问题，引导他自己想通。
              </p>
            </div>

            {/* 右：对话演示 */}
            <div>
              <ChatDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── 第五屏 做错了不要紧 ─────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-[72px]">
        <div className="mx-auto max-w-[760px]">
          <div ref={fadeError.ref} className={fadeError.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              从出错到掌握
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              做错了？AI 私教陪他把这个坑填上。
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {/* 步骤一 */}
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d5bd6]/10 text-sm font-bold text-[#1d5bd6]">
                1
              </span>
              <h3 className="mt-4 text-lg font-bold">AI 告诉他为什么错</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">
                不只说&ldquo;答案不对&rdquo;——哪里错了、这类错误为什么容易犯、下次怎么避免。从搞懂一道题，到搞懂一类题。
              </p>
            </div>
            {/* 步骤二 */}
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#34d399]/10 text-sm font-bold text-[#34d399]">
                2
              </span>
              <h3 className="mt-4 text-lg font-bold">自动出一道类似的题再练一遍</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">
                同一个知识点，换个情境。做对了，这个坑就算填上了。不用等到下周上课。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 第六屏 家长看得见 ───────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#eef3fb] to-[#f7f5f0] px-6 py-[72px]">
        <div className="mx-auto max-w-[900px]">
          <div ref={fadeParent.ref} className={fadeParent.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              为家长设计
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              不用问他&ldquo;学得怎么样&rdquo;
              <br />
              你自己能看到
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6">
              <h3 className="text-lg font-bold">薄弱知识点一目了然</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">
                递归错了几次、边界条件错了几次——哪里弱，看数据就知道。
              </p>
            </div>
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6">
              <h3 className="text-lg font-bold">考前知道大概什么水平</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">
                仿真模拟考试，考完 AI 自动生成诊断报告。不用等到考试那天。
              </p>
            </div>
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6">
              <h3 className="text-lg font-bold">他在认真练吗</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">
                分心超过两分钟，你会收到提醒。不用坐在旁边盯着。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 第七屏 定价 ─────────────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-[72px]">
        <div className="mx-auto max-w-[640px]">
          <div ref={fadePricing.ref} className={fadePricing.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              价格透明
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              一节课的价格
              <br />
              换一整个月的 AI 私教
            </h2>
            <p className="mt-3 text-sm text-[#777]">
              课堂负责教，AI 私教负责练。不是替代，是补全。
            </p>
          </div>

          {/* 套餐切换 */}
          <div className="mt-8 flex rounded-lg border border-[#e8e4db] bg-white p-1">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`relative flex-1 rounded-md py-2.5 text-sm font-medium transition ${
                  selectedPlan === p.id
                    ? "bg-[#1d5bd6] text-white shadow-sm"
                    : "text-[#444] hover:bg-gray-50"
                }`}
              >
                {p.name}
                {p.highlight && (
                  <span className="absolute -top-2 right-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    推荐
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 价格展示 */}
          <div className="mt-6 rounded-xl border border-[#e8e4db] bg-white p-6 text-center">
            <div className="flex items-end justify-center gap-1">
              <span className="text-4xl font-bold text-[#0c1524]">¥{plan.price}</span>
              <span className="mb-1 text-sm text-[#777]">{plan.unit}</span>
            </div>
            <p className="mt-1 text-sm text-[#aaa]">{plan.perMonth} · {plan.desc}</p>

            <div className="mt-6 border-t border-[#e8e4db] pt-6">
              <ul className="space-y-2.5 text-left text-sm text-[#444]">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#34d399]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={REGISTER_URL}
              className="mt-6 inline-block w-full rounded-xl bg-[#1d5bd6] py-3 text-sm font-semibold text-white transition hover:bg-[#1550b8] hover:-translate-y-0.5 hover:shadow-lg"
            >
              开始使用
            </Link>
          </div>

          {/* 免费提示 */}
          <div className="mt-4 rounded-lg border border-[#1d5bd6]/15 bg-[#1d5bd6]/5 px-4 py-3 text-center text-sm text-[#1d5bd6]">
            免费体验 1 道完整真题，包含 AI 私教对话、变形题、错因分析。先试，再决定。
          </div>
        </div>
      </section>

      {/* ── 第八屏 最终 CTA ─────────────────────────────────────────────── */}
      <section className="bg-[#0c1524] px-6 py-24 md:py-32 text-center">
        <div ref={fadeCta.ref} className={`mx-auto max-w-lg ${fadeCta.className}`}>
          <h2 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
            告别题海，自学成才
            <br />
            <span className="text-[#4a7fe8]">从这一道题开始</span>
          </h2>
          <Link
            href={REGISTER_URL}
            className="mt-8 inline-block rounded-xl border-2 border-white bg-transparent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white hover:text-[#0c1524] hover:-translate-y-0.5"
          >
            免费体验一道题
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e8e4db] bg-[#f7f5f0] px-6 py-8 text-center">
        <span className="text-lg font-bold text-[#1d5bd6]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
          GESP.AI
        </span>
      </footer>
    </div>
  );
}
