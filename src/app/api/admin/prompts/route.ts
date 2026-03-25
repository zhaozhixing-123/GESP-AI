import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const prompts = await prisma.prompt.findMany({ orderBy: { updatedAt: "desc" } });
  return Response.json({ prompts });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { name, category, content, variables } = await request.json();
    if (!name || !category || !content) {
      return Response.json({ error: "name、category、content 必填" }, { status: 400 });
    }

    const prompt = await prisma.prompt.create({
      data: { name, category, content, variables: variables || "[]" },
    });
    return Response.json(prompt, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return Response.json({ error: "名称已存在" }, { status: 409 });
    }
    return Response.json({ error: "创建失败" }, { status: 500 });
  }
}
