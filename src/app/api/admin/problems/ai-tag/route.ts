import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GESP C++ 1-8 级考纲全知识点标签
const GESP_TAGS = [
  // 1-2级：基础语法
  "顺序结构", "条件语句", "循环", "数组", "字符串",
  // 3级：函数与基础算法
  "函数", "枚举", "模拟", "位运算", "进制转换",
  // 4级：数据结构与排序
  "二维数组", "结构体", "排序", "递推",
  // 5级：递归与进阶算法
  "递归", "分治", "归并排序", "快速排序", "贪心",
  "高精度", "链表", "数论",
  // 6级：前缀/差分与搜索
  "前缀和", "差分", "二分查找", "栈", "队列", "动态规划",
  // 7级：树与图
  "DFS", "BFS", "树", "二叉树", "图论", "哈希表",
  // 8级：高级算法与数据结构
  "并查集", "堆", "线段树", "树状数组",
  "最短路", "最小生成树", "排列组合", "倍增",
  // 通用
  "数学",
];

/**
 * POST /api/admin/problems/ai-tag
 * 用 AI 根据题目内容从 GESP 考纲标签中选 1-3 个，流式返回进度
 * 支持传 { all: true } 强制重新打标全部题目
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

      let success = 0;
      let failed = 0;

      for (let i = 0; i < problems.length; i++) {
        const { id, luoguId, title, description } = problems[i];
        try {
          const msg = await client.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 64,
            system: `你是一个 GESP C++ 算法题分类助手。从以下标签中为题目选出最匹配的 1-3 个，优先选最核心的考察点。
只输出一个 JSON 字符串数组，不要任何解释、标点或其他内容，例如：["动态规划"] 或 ["DFS","树"]。
可用标签：${GESP_TAGS.join("、")}`,
            messages: [{
              role: "user",
              content: `题目：${title}\n描述：${description.slice(0, 300)}`,
            }],
          });

          const raw = (msg.content[0] as any).text.trim();
          // 精确匹配字符串数组，避免误匹配题目描述中的 [l, r] 等数学符号
          const match = raw.match(/\["[^"]*"(?:,\s*"[^"]*")*\]/);
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
