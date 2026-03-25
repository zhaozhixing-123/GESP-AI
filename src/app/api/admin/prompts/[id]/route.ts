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
    const { name, category, content, variables } = await request.json();

    const prompt = await prisma.prompt.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(content !== undefined && { content }),
        ...(variables !== undefined && { variables }),
      },
    });
    return Response.json(prompt);
  } catch (e: any) {
    if (e?.code === "P2025") return Response.json({ error: "不存在" }, { status: 404 });
    return Response.json({ error: "更新失败" }, { status: 500 });
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
    await prisma.prompt.delete({ where: { id: parseInt(id) } });
    return Response.json({ success: true });
  } catch (e: any) {
    if (e?.code === "P2025") return Response.json({ error: "不存在" }, { status: 404 });
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
