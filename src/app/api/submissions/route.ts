import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { judgeCode, mapStatus } from "@/lib/judge0";

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

    // 获取题目样例
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(problemId) },
      select: { samples: true },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    const samples: Array<{ input: string; output: string }> = JSON.parse(
      problem.samples || "[]"
    );

    if (samples.length === 0) {
      return Response.json({ error: "该题目暂无测试数据" }, { status: 400 });
    }

    // 对每个样例运行 Judge0
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

    for (const sample of samples) {
      const judge0Result = await judgeCode(code, sample.input);
      const status = mapStatus(judge0Result.status.id);
      const actualOutput = (judge0Result.stdout || "").trim();
      const expectedOutput = sample.output.trim();

      // 如果 Judge0 说 AC 但输出不匹配，标记为 WA
      let finalStatus = status;
      if (status === "AC" && actualOutput !== expectedOutput) {
        finalStatus = "WA";
      }

      results.push({
        input: sample.input,
        expectedOutput,
        actualOutput,
        status: finalStatus,
        time: judge0Result.time,
        memory: judge0Result.memory,
      });

      if (judge0Result.time) totalTime += parseFloat(judge0Result.time) * 1000;
      if (judge0Result.memory) maxMemory = Math.max(maxMemory, judge0Result.memory);

      // 如果不是 AC，整体状态取第一个非 AC 状态
      if (finalStatus !== "AC" && overallStatus === "AC") {
        overallStatus = finalStatus;
      }

      // CE 或 RE 不需要继续测试
      if (finalStatus === "CE" || finalStatus === "RE") {
        // 附加编译错误信息
        if (judge0Result.compile_output) {
          results[results.length - 1].actualOutput = judge0Result.compile_output;
        } else if (judge0Result.stderr) {
          results[results.length - 1].actualOutput = judge0Result.stderr;
        }
        break;
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
