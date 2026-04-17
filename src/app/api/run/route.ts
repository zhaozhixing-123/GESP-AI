import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { checkFreeLimit } from "@/lib/subscription";
import { judgeAll, judgeCode, mapStatus, getErrorMessage } from "@/lib/judge0";
import { normalizeOutput } from "@/lib/normalize";
import { checkRateLimit } from "@/lib/ratelimit";

const RUN_RATE_LIMIT = { name: "code_run", windowMs: 60_000, maxRequests: 10 };

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const rl = checkRateLimit(RUN_RATE_LIMIT, `user_${user.userId}`);
  if (!rl.allowed) {
    return Response.json({ error: "运行请求过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const { code, stdin, problemId } = await request.json();

    if (problemId) {
      const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
      if (!allowed) {
        return Response.json(
          { error: "free_limit", message: "免费体验已用完，订阅后解锁全部题目" },
          { status: 403 }
        );
      }
    }

    if (!code?.trim()) {
      return Response.json({ error: "代码不能为空" }, { status: 400 });
    }
    if (code.length > 50000) {
      return Response.json({ error: "代码长度不能超过 50000 字符" }, { status: 400 });
    }

    // 如果传了 problemId 且没有自定义 stdin，用样例逐个运行并对比
    if (problemId && stdin === undefined) {
      const problem = await prisma.problem.findUnique({
        where: { id: parseInt(problemId) },
        select: { samples: true },
      });

      let samples: Array<{ input: string; output: string }>;
      try {
        samples = JSON.parse(problem?.samples || "[]");
      } catch {
        console.error(`[Run] 题目 ${problemId} 样例数据格式损坏`);
        return Response.json({ error: "题目样例数据异常，请联系管理员" }, { status: 500 });
      }

      if (samples.length === 0) {
        return Response.json({ error: "该题目暂无样例" }, { status: 400 });
      }

      // 批量提交所有样例，并行等待结果
      const judge0Results = await judgeAll(code, samples.map((s) => s.input));

      const results: Array<{
        input: string;
        expectedOutput: string;
        actualOutput: string;
        status: string;
        time: string | null;
        memory: number | null;
        error: string;
      }> = [];

      for (let i = 0; i < samples.length; i++) {
        const result = judge0Results[i];
        const status = mapStatus(result);
        const actualOutput = normalizeOutput(result.stdout || "");
        const expectedOutput = normalizeOutput(samples[i].output);
        const error = getErrorMessage(result);

        let finalStatus = status;
        if (status === "AC") {
          finalStatus = actualOutput === expectedOutput ? "AC" : "WA";
        }

        results.push({
          input: samples[i].input,
          expectedOutput,
          actualOutput,
          status: finalStatus,
          time: result.time,
          memory: result.memory,
          error: finalStatus === "AC" ? "" : error,
        });

        if (finalStatus === "CE") break;
      }

      return Response.json({ mode: "samples", results });
    }

    // 没有 problemId，纯运行自定义输入
    const result = await judgeCode(code, stdin || "");
    const status = mapStatus(result);

    const statusTextMap: Record<string, string> = {
      AC: "运行成功",
      WA: "运行成功",
      TLE: "超时",
      CE: "编译错误",
      RE: "运行错误",
      MLE: "内存超限",
    };

    return Response.json({
      mode: "custom",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      compileOutput: result.compile_output || "",
      status: statusTextMap[status] || "运行成功",
      statusId: result.status.id,
      time: result.time,
      memory: result.memory,
    });
  } catch (e: any) {
    console.error("Run error:", e);
    return Response.json({ error: "运行失败，请重试" }, { status: 500 });
  }
}
