import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { judgeCode, mapStatus, getErrorMessage } from "@/lib/judge0";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { code, stdin, problemId } = await request.json();

    if (!code?.trim()) {
      return Response.json({ error: "代码不能为空" }, { status: 400 });
    }

    // 如果传了 problemId，用样例逐个运行并对比
    if (problemId) {
      const problem = await prisma.problem.findUnique({
        where: { id: parseInt(problemId) },
        select: { samples: true },
      });

      const samples: Array<{ input: string; output: string }> = JSON.parse(
        problem?.samples || "[]"
      );

      if (samples.length === 0) {
        return Response.json({ error: "该题目暂无样例" }, { status: 400 });
      }

      const results: Array<{
        input: string;
        expectedOutput: string;
        actualOutput: string;
        status: string;
        time: string | null;
        memory: number | null;
        error: string;
      }> = [];

      for (const sample of samples) {
        const result = await judgeCode(code, sample.input);
        const status = mapStatus(result);
        const actualOutput = (result.stdout || "").replace(/\s+$/, "");
        const expectedOutput = sample.output.replace(/\s+$/, "");
        const error = getErrorMessage(result);

        // AC 只表示程序正常运行，需要对比输出
        let finalStatus = status;
        if (status === "AC") {
          finalStatus = actualOutput === expectedOutput ? "AC" : "WA";
        }

        results.push({
          input: sample.input,
          expectedOutput,
          actualOutput,
          status: finalStatus,
          time: result.time,
          memory: result.memory,
          error: finalStatus === "AC" ? "" : error,
        });

        // CE 不需要继续
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
    return Response.json({ error: e.message || "运行失败" }, { status: 500 });
  }
}
