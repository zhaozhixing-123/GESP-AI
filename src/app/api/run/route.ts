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

    return Response.json({
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      compileOutput: result.compile_output || "",
      status: result.status.description,
      statusId: result.status.id,
      time: result.time,
      memory: result.memory,
    });
  } catch (e: any) {
    console.error("Run error:", e);
    return Response.json({ error: e.message || "运行失败" }, { status: 500 });
  }
}
