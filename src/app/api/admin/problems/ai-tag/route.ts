import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GESP 考纲对齐的标签列表
const GESP_TAGS = [
  "顺序结构", "条件语句", "循环", "数组", "字符串", "函数", "递归",
  "排序", "二分查找", "贪心", "动态规划", "图论", "DFS", "BFS",
  "数学", "模拟", "栈", "队列", "树", "前缀和", "高精度",
];

/**
 * POST /api/admin/problems/ai-tag
 * 用 AI 根据题目内容从 GESP 考纲标签中选 1-3 个，流式返回进度
 * 支持传 { all: true } 强制重新打标全部题目
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
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

      let success = 0;
      let failed = 0;

      for (let i = 0; i < problems.length; i++) {
        const { id, luoguId, title, description } = problems[i];
        try {
          const msg = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 64,
            system: `你是一个 GESP 算法题分类助手。从以下标签中为题目选出最匹配的 1-3 个，只输出 JSON 数组，不要其他内容。
可用标签：${GESP_TAGS.join("、")}`,
            messages: [{
              role: "user",
              content: `题目：${title}\n描述：${description.slice(0, 300)}`,
            }],
          });

          const raw = (msg.content[0] as any).text.trim();
          // 提取 JSON 数组
          const match = raw.match(/\[[\s\S]*\]/);
          let tags: string[] = [];
          if (match) {
            const parsed: string[] = JSON.parse(match[0]);
            tags = parsed.filter((t) => GESP_TAGS.includes(t)).slice(0, 3);
          }
          if (tags.length === 0) tags = ["模拟"]; // 兜底

          await prisma.problem.update({ where: { id }, data: { tags: JSON.stringify(tags) } });
          success++;
          send({ luoguId, tags, status: "ok", current: i + 1, total: problems.length });
        } catch (e: any) {
          failed++;
          send({ luoguId, status: "error", error: e.message, current: i + 1, total: problems.length });
        }
        // haiku 速度快，间隔短一点
        if (i < problems.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
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
