import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit } from "@/lib/subscription";

async function handleVariantGet(userId: number, variantId: number): Promise<Response> {
  if (isNaN(variantId)) return Response.json({ error: "无效变形题 ID" }, { status: 404 });

  // 先检查 genStatus，避免两次查询走不同路径
  const full = await prisma.variantProblem.findUnique({
    where: { id: variantId },
    select: {
      id: true, sourceId: true, title: true, level: true, tags: true,
      description: true, inputFormat: true, outputFormat: true, samples: true,
      genStatus: true,
    },
  });

  if (!full || full.genStatus !== "ready") {
    return Response.json({ error: "变形题不存在" }, { status: 404 });
  }

  const variant = full;

  // 鉴权：用户必须有解锁记录
  const readyVariants = await prisma.variantProblem.findMany({
    where: { sourceId: full.sourceId, genStatus: "ready" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const idx   = readyVariants.findIndex((v) => v.id === variantId);
  const batch = idx < 2 ? 1 : 2;

  const unlock = await prisma.variantUnlock.findUnique({
    where: { userId_problemId_batch: { userId, problemId: full.sourceId, batch } },
  });

  if (!unlock) return Response.json({ error: "变形题不存在" }, { status: 404 });

  // 获取源题 luoguId 供前端显示
  const source = await prisma.problem.findUnique({
    where: { id: full.sourceId },
    select: { luoguId: true },
  });

  return Response.json({ ...variant, isVariant: true, sourceLuoguId: source?.luoguId ?? "" });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // id 以 "v" 开头表示变形题，如 "v42"
    if (id.startsWith("v")) {
      return handleVariantGet(user.userId, parseInt(id.slice(1)));
    }

    const problemId = parseInt(id);

    const allowed = await checkFreeLimit(user.userId, problemId);
    if (!allowed) {
      return Response.json(
        { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
        { status: 403 }
      );
    }

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        luoguId: true,
        title: true,
        level: true,
        tags: true,
        description: true,
        inputFormat: true,
        outputFormat: true,
        samples: true,
        // 不返回 testCases
      },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    return Response.json({ ...problem, isVariant: false });
  } catch {
    return Response.json({ error: "获取题目失败" }, { status: 500 });
  }
}
