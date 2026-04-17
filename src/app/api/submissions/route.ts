import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit, getSubscriptionInfo } from "@/lib/subscription";
import { judgeAll, mapStatus, getErrorMessage } from "@/lib/judge0";
import { normalizeOutput } from "@/lib/normalize";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { problemId, code } = await request.json();

    if (!problemId || !code?.trim()) {
      return Response.json({ error: "题目ID和代码不能为空" }, { status: 400 });
    }
    if (code.length > 50000) {
      return Response.json({ error: "代码长度不能超过 50000 字符" }, { status: 400 });
    }

    const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
    if (!allowed) {
      return Response.json(
        { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
        { status: 403 }
      );
    }

    // 获取题目样例 + 额外测试数据
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(problemId) },
      select: { samples: true, testCases: true },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    let samples: Array<{ input: string; output: string }>;
    let extraTests: Array<{ input: string; output: string }>;
    try {
      samples = JSON.parse(problem.samples || "[]");
      extraTests = JSON.parse(problem.testCases || "[]");
    } catch {
      console.error(`[Submissions] 题目 ${problemId} 测试数据格式损坏`);
      return Response.json({ error: "题目测试数据异常，请联系管理员" }, { status: 500 });
    }

    // 合并样例 + 额外测试点
    const allTests = [...samples, ...extraTests];

    if (allTests.length === 0) {
      return Response.json({ error: "该题目暂无测试数据" }, { status: 400 });
    }

    // 批量提交所有测试点，并行等待结果
    const judge0Results = await judgeAll(code, allTests.map((t) => t.input));

    const results: Array<{
      input: string;
      expectedOutput: string;
      actualOutput: string;
      status: string;
      time: string | null;
      memory: number | null;
    }> = [];

    let overallStatus = "AC";
    let totalTime = 0;
    let maxMemory = 0;

    for (let idx = 0; idx < allTests.length; idx++) {
      const judge0Result = judge0Results[idx];
      const status = mapStatus(judge0Result);
      const actualOutput = normalizeOutput(judge0Result.stdout || "");
      const expectedOutput = normalizeOutput(allTests[idx].output);

      // Judge0 "AC" 只表示程序正常运行，需要对比输出判断真正的 AC/WA
      let finalStatus = status;
      if (status === "AC") {
        finalStatus = actualOutput === expectedOutput ? "AC" : "WA";
      }
      // CE 时用错误信息替换实际输出
      if (finalStatus === "CE") {
        results.push({
          input: allTests[idx].input,
          expectedOutput,
          actualOutput: getErrorMessage(judge0Result),
          status: finalStatus,
          time: judge0Result.time,
          memory: judge0Result.memory,
        });
        overallStatus = "CE";
        break;
      }

      results.push({
        input: allTests[idx].input,
        expectedOutput,
        actualOutput,
        status: finalStatus,
        time: judge0Result.time,
        memory: judge0Result.memory,
      });

      if (judge0Result.time) totalTime += parseFloat(judge0Result.time) * 1000;
      if (judge0Result.memory) maxMemory = Math.max(maxMemory, judge0Result.memory);

      if (finalStatus !== "AC" && overallStatus === "AC") {
        overallStatus = finalStatus;
      }
    }

    // 每用户每题最多保留 50 条提交，超出 FIFO 删除
    const MAX_PER_PROBLEM = 50;
    const oldCount = await prisma.submission.count({
      where: { userId: user.userId, problemId: parseInt(problemId) },
    });
    if (oldCount >= MAX_PER_PROBLEM) {
      const toDelete = await prisma.submission.findMany({
        where: { userId: user.userId, problemId: parseInt(problemId) },
        orderBy: { createdAt: "asc" },
        take: oldCount - MAX_PER_PROBLEM + 1,
        select: { id: true },
      });
      await prisma.submission.deleteMany({
        where: { id: { in: toDelete.map(s => s.id) } },
      });
    }

    // 保存提交记录
    const submission = await prisma.submission.create({
      data: {
        userId: user.userId,
        problemId: parseInt(problemId),
        code,
        language: "cpp",
        status: overallStatus,
        timeUsed: Math.round(totalTime),
        memoryUsed: maxMemory,
      },
    });

    // 非 AC 自动加入错题本（upsert 避免重复）
    if (overallStatus !== "AC") {
      await prisma.wrongBook.upsert({
        where: {
          userId_problemId: { userId: user.userId, problemId: parseInt(problemId) },
        },
        update: {},
        create: { userId: user.userId, problemId: parseInt(problemId) },
      });

      // 付费用户：解锁该题 batch1 变形题（幂等，重复触发无副作用）
      const sub = await getSubscriptionInfo(user.userId);
      if (sub.isPaid) {
        const hasVariants = await prisma.variantProblem.count({
          where: { sourceId: parseInt(problemId), genStatus: "ready" },
        });
        if (hasVariants > 0) {
          await prisma.variantUnlock.upsert({
            where: {
              userId_problemId_batch: { userId: user.userId, problemId: parseInt(problemId), batch: 1 },
            },
            update: {},
            create: { userId: user.userId, problemId: parseInt(problemId), batch: 1 },
          });
        }
      }
    }

    return Response.json({ submission, results });
  } catch (e: any) {
    console.error("Submission error:", e);
    return Response.json(
      { error: "提交失败，请重试" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const problemId = url.searchParams.get("problemId");

    const where: any = { userId: user.userId };
    if (problemId) where.problemId = parseInt(problemId);

    const submissions = await prisma.submission.findMany({
      where,
      select: {
        id: true,
        problemId: true,
        status: true,
        language: true,
        timeUsed: true,
        memoryUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return Response.json({ submissions });
  } catch {
    return Response.json({ error: "获取提交记录失败" }, { status: 500 });
  }
}
