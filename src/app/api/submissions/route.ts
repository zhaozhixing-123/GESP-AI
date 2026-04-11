import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { judgeAll, mapStatus, getErrorMessage } from "@/lib/judge0";
import { normalizeOutput } from "@/lib/normalize";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { problemId, code } = await request.json();

    if (!problemId || !code?.trim()) {
      return Response.json({ error: "题目ID和代码不能为空" }, { status: 400 });
    }

    // 获取题目样例 + 额外测试数据
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(problemId) },
      select: { samples: true, testCases: true },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    const samples: Array<{ input: string; output: string }> = JSON.parse(
      problem.samples || "[]"
    );
    const extraTests: Array<{ input: string; output: string }> = JSON.parse(
      problem.testCases || "[]"
    );

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
    }

    return Response.json({ submission, results });
  } catch (e: any) {
    console.error("Submission error:", e);
    return Response.json(
      { error: e.message || "提交失败，请重试" },
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
