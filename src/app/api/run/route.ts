import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { judgeCode } from "@/lib/judge0";

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
        const actualOutput = (result.stdout || "").replace(/\s+$/, "");
        const expectedOutput = sample.output.replace(/\s+$/, "");

        let status: string;
        let error = "";
        if (result.status.id === 6) {
          status = "CE";
          error = result.compile_output || "";
        } else if (result.status.id === 5) {
          status = "TLE";
        } else if (result.status.id >= 7 && result.status.id <= 14) {
          status = "RE";
          error = result.stderr || "";
        } else {
          status = actualOutput === expectedOutput ? "AC" : "WA";
        }

        results.push({
          input: sample.input,
          expectedOutput,
          actualOutput,
          status,
          time: result.time,
          memory: result.memory,
          error,
        });

        // CE/RE 不需要继续
        if (status === "CE" || status === "RE") break;
      }

      return Response.json({ mode: "samples", results });
    }

    // 没有 problemId，纯运行自定义输入
    const result = await judgeCode(code, stdin || "");

    let status: string;
    if (result.status.id === 6) status = "编译错误";
    else if (result.status.id === 5) status = "超时";
    else if (result.status.id >= 7 && result.status.id <= 14) status = "运行错误";
    else status = "运行成功";

    return Response.json({
      mode: "custom",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      compileOutput: result.compile_output || "",
      status,
      statusId: result.status.id,
      time: result.time,
      memory: result.memory,
    });
  } catch (e: any) {
    console.error("Run error:", e);
    return Response.json({ error: e.message || "运行失败" }, { status: 500 });
  }
}
