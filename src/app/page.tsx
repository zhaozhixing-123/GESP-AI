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
  "AI 老师无限对话",
  "全部变形题解锁",
  "AI 错因分析",
  "模拟考试 + AI 诊断报告",
  "专注力追踪 + 家长通知",
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
  const bottomRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver 触发播放
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
    await sleep(3000);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-[#111827] shadow-2xl overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-[#34d399]" />
          <span className="text-sm text-gray-400">AI 老师在线</span>
          <span className="text-xs text-gray-600 ml-auto font-mono">晚上 9:47</span>
        </div>
        {/* 消息区 */}
        <div className="h-[340px] overflow-y-auto p-4 space-y-3">
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
          <div ref={bottomRef} />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-500">真实 AI 对话示例 · Claude 驱动</p>
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

  // 已登录用户直接跳转题库
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("token")) {
      router.replace("/problems");
    }
  }, [router]);

  const fade1 = useFadeIn();
  const fade2 = useFadeIn();
  const fade3 = useFadeIn();
  const fade4 = useFadeIn();
  const fade5 = useFadeIn();
  const fade6 = useFadeIn();
  const fade7 = useFadeIn();
  const fade8 = useFadeIn();

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
            免费体验
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
          <span className="inline-block rounded-full border border-[#1d5bd6]/20 bg-[#1d5bd6]/5 px-4 py-1.5 text-xs font-medium text-[#1d5bd6]">
            由一名 GESP 五级小学生创建并验证
          </span>

          <h1 className="mt-8 text-3xl font-bold leading-snug tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.3]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
            课堂教了算法，
            <br />
            但孩子自己练题卡住的时候，
            <br />
            没人能帮他
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-[#444] sm:text-lg">
            GESP.AI——孩子自己练题时，身边的 AI 老师。
            <br />
            卡住了问一句，不给答案，引导他自己想明白。
          </p>

          <div className="mt-10">
            <Link
              href={REGISTER_URL}
              className="inline-block rounded-xl bg-[#1d5bd6] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#1d5bd6]/20 transition hover:bg-[#1550b8] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#1d5bd6]/30"
            >
              免费体验一道题
            </Link>
            <p className="mt-3 text-sm text-[#aaa]">
              完整体验 AI 老师 + 变形题 + 错因分析，无需付费
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

      {/* ── 第二屏 场景 ─────────────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[700px]">
          <div ref={fade1.ref} className={fade1.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              你是不是也经历过
            </span>
          </div>

          {/* 场景一 */}
          <div ref={fade2.ref} className={`mt-10 ${fade2.className}`}>
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6 md:p-8">
              <span className="inline-block rounded bg-[#0c1524] px-2 py-0.5 text-xs font-mono text-white">晚上 9:12</span>
              <p className="mt-4 text-[#444] leading-relaxed">
                孩子刷题卡住了。他盯着屏幕，不知道哪里错了。你走过去看了一眼——看不懂 C++。他要么放弃这道题，要么打开搜索引擎，把别人的答案抄了一遍。
              </p>
              <p className="mt-3 text-sm italic text-[#1d5bd6]">
                这道题"过了"。但你们都知道，他没有学会。
              </p>
            </div>
          </div>

          {/* 场景二 */}
          <div ref={fade3.ref} className={`mt-6 ${fade3.className}`}>
            <div className="rounded-xl border border-[#e8e4db] bg-white p-6 md:p-8">
              <span className="inline-block rounded bg-[#0c1524] px-2 py-0.5 text-xs font-mono text-white">考前一周</span>
              <p className="mt-4 text-[#444] leading-relaxed">
                你问孩子准备得怎么样，他说"差不多了"。你想帮他检验一下，但你不知道怎么检验。考试那天，题目换了个情境。成绩出来的那一刻，你才知道"差不多了"到底差多少。
              </p>
            </div>
          </div>

          {/* 转折 */}
          <div ref={fade4.ref} className={`mt-8 ${fade4.className}`}>
            <div className="rounded-xl bg-[#0c1524] p-6 md:p-8 text-gray-300">
              <p className="leading-relaxed">问题不在课堂，也不在孩子。</p>
              <p className="mt-2 font-bold text-white leading-relaxed">
                课堂负责"教"，但孩子需要帮助的时刻，是自己"练"的时候——而那个时刻，没有人在。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 第三屏 AI 老师 ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#0c1524] to-[#111d30] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[720px]">
          <div ref={fade5.ref} className={fade5.className}>
            <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#4a7fe8]">
              现在，有人在了
            </span>

            <h2 className="mt-6 text-2xl font-bold text-white sm:text-3xl md:text-4xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              晚上九点，AI 老师还在
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-gray-400">
              孩子卡住的时候发一条消息，AI 老师不会直接给答案——
              而是问他一个问题，引导他自己找到答案。
            </p>
          </div>

          {/* AI 对话演示 */}
          <div className="mt-10">
            <ChatDemo />
          </div>

          <div ref={fade6.ref} className={`mt-10 text-center ${fade6.className}`}>
            <p className="text-base leading-relaxed text-gray-300">
              不给答案，只问问题。
              <br />
              像一个有耐心的老师坐在旁边——
              <br />
              24 小时在线，随时可以问。
            </p>
          </div>
        </div>
      </section>

      {/* ── 第四屏 做错了不要紧 ─────────────────────────────────────────── */}
      <section className="bg-[#f7f5f0] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[760px]">
          <div ref={fade7.ref} className={fade7.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              从出错到掌握
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              做错了？AI 陪他把这个坑填上。
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
                不只说"答案不对"——哪里错了、这类错误为什么容易犯、下次怎么避免。从搞懂一道题，到搞懂一类题。
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

          {/* 数据条 */}
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: "200+", label: "道历年真题" },
              { value: "800+", label: "道 AI 变形题" },
              { value: "1-8 级", label: "全覆盖" },
              { value: "24h", label: "AI 老师在线" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[#e8e4db] bg-white px-4 py-4 text-center">
                <div className="text-xl font-bold text-[#1d5bd6] sm:text-2xl">{item.value}</div>
                <div className="mt-1 text-xs text-[#777]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 第五屏 故事 + 定价 ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#eef3fb] to-[#f7f5f0] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[640px]">
          {/* 创始人故事 */}
          <div ref={fade8.ref} className={fade8.className}>
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              关于创造者
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              这个产品的创造者，今年五年级。
            </h2>
          </div>

          <div className="mt-8 rounded-xl border border-[#e8e4db] bg-white p-6 md:p-8">
            <p className="text-[#444] leading-relaxed">
              赵知行，五年级。从四年级开始学信息学。
            </p>
            <p className="mt-4 text-[#444] leading-relaxed">
              他在备考中碰到了和所有孩子一样的问题：<strong className="text-[#0c1524]">课上听懂了，回家练题卡住了，没人能帮他。</strong>去网上搜答案吧，搜到了也不知道为什么——下次遇到还是不会。
            </p>
            <p className="mt-4 text-[#444] leading-relaxed">
              他想要的很简单：一个在他卡住的时候，不告诉他答案、但能引导他自己想明白的工具。找不到，他就自己写了一个。
            </p>
            <p className="mt-4 text-[#444] leading-relaxed">
              2026 年 3 月，他用这套方法通过了 <span className="font-bold text-[#1d5bd6]">GESP C++ 五级</span>。现在他把它开放给所有正在备考的孩子。
            </p>
          </div>

          {/* 定价 */}
          <div className="mt-16">
            <span className="inline-block rounded-full border border-[#e8e4db] bg-white px-3 py-1 text-xs font-medium text-[#777]">
              价格透明
            </span>
            <h2 className="mt-6 text-2xl font-bold sm:text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              一节课的价格，换一整个月的 AI 陪练。
            </h2>
            <p className="mt-3 text-sm text-[#777]">
              课堂负责教，GESP.AI 负责练。不是替代，是补全。
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
              立即开始
            </Link>
          </div>

          {/* 免费提示 */}
          <div className="mt-4 rounded-lg border border-[#1d5bd6]/15 bg-[#1d5bd6]/5 px-4 py-3 text-center text-sm text-[#1d5bd6]">
            <span className="mr-1">🎁</span>
            免费体验：1 道完整真题，包含 AI 老师对话、变形题、错因分析。先试，再决定。
          </div>
        </div>
      </section>

      {/* ── 第六屏 最终 CTA ─────────────────────────────────────────────── */}
      <section className="bg-[#0c1524] px-6 py-24 md:py-32 text-center">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
            下次孩子卡住的时候
            <br />
            <span className="text-[#4a7fe8]">让他试试问 AI 老师</span>
          </h2>
          <p className="mt-4 text-gray-400">
            免费体验一道完整题目，感受 AI 引导式教学的效果
          </p>
          <Link
            href={REGISTER_URL}
            className="mt-8 inline-block rounded-xl border-2 border-white bg-transparent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white hover:text-[#0c1524] hover:-translate-y-0.5"
          >
            免费开始体验
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e8e4db] bg-[#f7f5f0] px-6 py-8 text-center">
        <span className="text-lg font-bold text-[#1d5bd6]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
          GESP.AI
        </span>
        <p className="mt-1 text-xs text-[#aaa]">
          专为 GESP 备考设计的 AI 学习平台 · gesp.ai
        </p>
      </footer>
    </div>
  );
}
