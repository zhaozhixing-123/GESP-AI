import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { streamWrongCodeAnalysis } from "@/lib/aiteacher";

/** POST /api/wrongbook/analyze — 错题一次性分析，不读写 ChatHistory */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const { problemId } = await request.json();
    if (!problemId) return Response.json({ error: "缺少 problemId" }, { status: 400 });

    const stream = await streamWrongCodeAnalysis({
      userId: user.userId,
      problemId: parseInt(problemId),
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("[WrongbookAnalyze]", e);
    return Response.json({ error: e.message || "分析失败" }, { status: 500 });
  }
}
