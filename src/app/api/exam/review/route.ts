import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { streamExamReview, ExamProblemEntry } from "@/lib/aiteacher";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { problems, timeUsedMinutes } = await request.json() as {
      problems: ExamProblemEntry[];
      timeUsedMinutes: number;
    };

    if (!problems?.length) {
      return Response.json({ error: "题目数据不能为空" }, { status: 400 });
    }

    const stream = await streamExamReview(problems, timeUsedMinutes);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("Exam review error:", e);
    return Response.json({ error: e.message || "生成报告失败" }, { status: 500 });
  }
}
