import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, level, description, inputFormat, outputFormat, samples, testCases } = body;

    const problem = await prisma.problem.update({
      where: { id: parseInt(id) },
      data: {
        ...(title !== undefined && { title }),
        ...(level !== undefined && { level: parseInt(level) }),
        ...(description !== undefined && { description }),
        ...(inputFormat !== undefined && { inputFormat }),
        ...(outputFormat !== undefined && { outputFormat }),
        ...(samples !== undefined && { samples }),
        ...(testCases !== undefined && { testCases }),
      },
    });

    return Response.json(problem);
  } catch (e: any) {
    if (e?.code === "P2025") {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }
    return Response.json({ error: "更新题目失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    await prisma.problem.delete({ where: { id: parseInt(id) } });
    return Response.json({ success: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }
    return Response.json({ error: "删除题目失败" }, { status: 500 });
  }
}
