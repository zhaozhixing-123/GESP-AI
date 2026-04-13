import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, JwtPayload } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const problems = await prisma.problem.findMany({
      orderBy: { luoguId: "asc" },
    });
    return Response.json({ problems });
  } catch {
    return Response.json({ error: "获取题目列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { luoguId, title, level, description, inputFormat, outputFormat, samples, testCases } = body;

    if (!luoguId || !title || !level) {
      return Response.json({ error: "luoguId、title、level 为必填项" }, { status: 400 });
    }

    const problem = await prisma.problem.create({
      data: {
        luoguId,
        title,
        level: parseInt(level),
        description: description || "",
        inputFormat: inputFormat || "",
        outputFormat: outputFormat || "",
        samples: samples || "[]",
        testCases: testCases || "[]",
      },
    });

    return Response.json(problem, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return Response.json({ error: "luoguId 已存在" }, { status: 409 });
    }
    return Response.json({ error: "创建题目失败" }, { status: 500 });
  }
}
