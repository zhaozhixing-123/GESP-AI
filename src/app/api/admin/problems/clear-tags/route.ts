import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/problems/clear-tags
 * 将所有题目的 tags 重置为 "[]"
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const result = await prisma.problem.updateMany({ data: { tags: "[]" } });

  return Response.json({ message: `已清空 ${result.count} 道题目的标签` });
}
