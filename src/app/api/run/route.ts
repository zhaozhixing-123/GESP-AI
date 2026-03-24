import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { judgeCode } from "@/lib/judge0";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { code, stdin } = await request.json();

    if (!code?.trim()) {
      return Response.json({ error: "代码不能为空" }, { status: 400 });
    }

    const result = await judgeCode(code, stdin || "");

    // Judge0 status 3 = 程序正常运行（不代表答案正确）
    // 翻译为更清晰的中文状态
    const statusMap: Record<number, string> = {
      3: "运行成功",
      4: "运行成功",  // Judge0 的 WA 在纯运行模式下也是运行成功
      5: "超时",
      6: "编译错误",
      7: "运行错误 (SIGSEGV)",
      8: "运行错误 (SIGXFSZ)",
      9: "运行错误 (SIGFPE)",
      10: "运行错误 (SIGABRT)",
      11: "运行错误 (NZEC)",
      12: "运行错误",
      13: "内部错误",
      14: "运行错误",
    };

    return Response.json({
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      compileOutput: result.compile_output || "",
      status: statusMap[result.status.id] || result.status.description,
      statusId: result.status.id,
      time: result.time,
      memory: result.memory,
    });
  } catch (e: any) {
    console.error("Run error:", e);
    return Response.json({ error: e.message || "运行失败" }, { status: 500 });
  }
}
