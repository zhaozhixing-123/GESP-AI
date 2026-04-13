import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { generateTestCases, TESTGEN_MODEL_DISPLAY } from "@/lib/testgen";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(id) },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    const testCases = await generateTestCases({
      title: problem.title,
      description: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      samples: problem.samples,
    });

    if (testCases.length === 0) {
      return Response.json({ error: "未能生成有效的测试数据，请重试" }, { status: 500 });
    }

    // 保存到数据库（替换现有的 testCases）
    await prisma.problem.update({
      where: { id: parseInt(id) },
      data: { testCases: JSON.stringify(testCases) },
    });

    return Response.json({
      message: `成功生成 ${testCases.length} 个测试点（双解法交叉验证通过）`,
      count: testCases.length,
      model: TESTGEN_MODEL_DISPLAY,
    });
  } catch (e: any) {
    console.error("Generate testcases error:", e);
    return Response.json(
      { error: e.message || "生成失败，请重试" },
      { status: 500 }
    );
  }
}
