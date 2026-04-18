import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logLlmError, logLlmSuccess } from "@/lib/llmCost";
import { promptCache } from "@/lib/prompt-cache";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GESP C++ 1-8 级考纲全知识点标签（4 类正交维度，每题跨类挑 1-4 个考察点）
const GESP_TAG_GROUPS = {
  "C++语言特性": [
    "顺序结构", "条件分支", "循环结构", "一维数组", "字符串",
    "函数", "位运算", "进制转换", "二维数组", "结构体",
    "指针", "引用", "递归函数", "STL-vector", "STL-stack",
    "STL-queue", "STL-map/set", "STL-priority_queue", "面向对象", "文件读写",
  ],
  "数据结构": [
    "链表", "栈", "队列", "单调栈", "单调队列",
    "哈希表", "二叉树", "一般树", "图", "堆",
    "并查集", "树状数组", "线段树", "Trie",
  ],
  "算法思想": [
    "模拟", "枚举", "递推", "排序-基础", "贪心",
    "分治", "归并排序", "快速排序", "高精度", "前缀和",
    "差分", "二分查找", "二分答案", "双指针", "DFS",
    "BFS", "回溯", "记忆化搜索", "DP-线性", "DP-背包",
    "DP-区间", "DP-树形", "DP-状压", "DP-数位",
    "拓扑排序", "最短路-Dijkstra", "最短路-Floyd",
    "最小生成树-Kruskal", "最小生成树-Prim", "倍增/LCA",
  ],
  "数学": [
    "数论-质数与筛法", "数论-gcd/lcm", "数论-快速幂", "数论-同余/取模",
    "排列组合", "概率", "几何",
  ],
} as const;

const GESP_TAGS: readonly string[] = Object.values(GESP_TAG_GROUPS).flat();

function renderTagGroups(): string {
  return Object.entries(GESP_TAG_GROUPS)
    .map(([cat, tags]) => `- ${cat}：${tags.join(" / ")}`)
    .join("\n");
}

export const DEFAULT_PROBLEM_AUTOTAG_PROMPT = `你是一个 GESP C++ 算法题分类助手。标签按四个正交维度组织：C++语言特性、数据结构、算法思想、数学。请为题目从这四个维度中挑出最核心的考察点，总共 1-4 个标签（不要为了凑数而加）。
标签必须严格来自下面清单，不要编造或改写。只输出一个 JSON 字符串数组，不要任何解释、标点或其他内容，例如：["DFS","二叉树","递归函数"] 或 ["顺序结构"]。若题目不足以匹配任何标签，输出 []。

可用标签：
{{gesp_tags}}`;

async function getProblemAutotagPrompt(): Promise<string> {
  return promptCache.get("problem_autotag", async () => {
    try {
      const prompt = await prisma.prompt.findFirst({
        where: { category: "problem_autotag" },
        orderBy: { updatedAt: "desc" },
      });
      if (prompt?.content) return prompt.content;
    } catch (e) {
      console.error("[AITag] 加载自动打标提示词失败:", e);
    }
    return DEFAULT_PROBLEM_AUTOTAG_PROMPT;
  });
}

/**
 * POST /api/admin/problems/ai-tag
 * 用 AI 根据题目内容从 GESP 考纲标签中跨 4 个分类挑 1-4 个，流式返回进度。
 * 匹配不到则保留空数组（status:"empty"），不再强塞"模拟"。
 * 支持传 { all: true } 强制重新打标全部题目。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const forceAll = body.all === true;

  const problems = await prisma.problem.findMany({
    where: forceAll ? undefined : { tags: "[]" },
    select: { id: true, luoguId: true, title: true, description: true },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      if (problems.length === 0) {
        send({ done: true, message: "所有题目已有标签，无需打标" });
        controller.close();
        return;
      }

      // system prompt 提到循环外，200+ 次调用共享 Anthropic prompt cache
      const template = await getProblemAutotagPrompt();
      const systemText = template.replaceAll("{{gesp_tags}}", renderTagGroups());
      const systemBlocks = [
        {
          type: "text" as const,
          text: systemText,
          cache_control: { type: "ephemeral" as const },
        },
      ];

      let success = 0;
      let failed = 0;

      for (let i = 0; i < problems.length; i++) {
        const { id, luoguId, title, description } = problems[i];
        const autotagModel = "claude-opus-4-7";
        const autotagStartedAt = Date.now();
        try {
          let msg;
          try {
            msg = await client.messages.create({
              model: autotagModel,
              max_tokens: 64,
              system: systemBlocks,
              messages: [{
                role: "user",
                content: `题目：${title}\n描述：${description.slice(0, 300)}`,
              }],
            });
          } catch (e) {
            await logLlmError({
              purpose: "problem_autotag",
              model: autotagModel,
              error: e,
              startedAt: autotagStartedAt,
            });
            throw e;
          }

          await logLlmSuccess({
            purpose: "problem_autotag",
            model: msg.model || autotagModel,
            usage: msg.usage,
            startedAt: autotagStartedAt,
          });

          const raw = (msg.content[0] as any).text.trim();
          // 精确匹配字符串数组，避免误匹配题目描述中的 [l, r] 等数学符号；也允许空数组
          const match = raw.match(/\[(?:"[^"]*"(?:,\s*"[^"]*")*)?\]/);
          let tags: string[] = [];
          if (match) {
            const parsed: string[] = JSON.parse(match[0]);
            tags = parsed.filter((t) => GESP_TAGS.includes(t)).slice(0, 4);
          }

          await prisma.problem.update({ where: { id }, data: { tags: JSON.stringify(tags) } });
          success++;
          send({
            luoguId,
            tags,
            status: tags.length === 0 ? "empty" : "ok",
            current: i + 1,
            total: problems.length,
          });
        } catch (e: any) {
          failed++;
          send({ luoguId, status: "error", error: e.message, current: i + 1, total: problems.length });
        }
        if (i < problems.length - 1) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      send({ done: true, message: `打标完成：成功 ${success}，失败 ${failed}，共 ${problems.length} 题` });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
