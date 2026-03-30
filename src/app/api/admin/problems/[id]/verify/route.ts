import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { verifyTestCases, VERIFY_MODEL_DISPLAY } from "@/lib/testverify";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(id) },
    });

    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    const testCases = JSON.parse(problem.testCases || "[]");
    if (testCases.length === 0) {
      return Response.json({ error: "该题目没有测试数据，请先生成" }, { status: 400 });
    }

    const result = await verifyTestCases({
      title: problem.title,
      description: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      samples: problem.samples,
      testCases: problem.testCases,
    });

    // 如果有不一致的测试点，自动清理并保存
    if (result.failed > 0) {
      const passedIndices = new Set(
        result.details.filter((d) => d.status === "pass").map((d) => d.index)
      );
      const cleanedTestCases = testCases.filter((_: any, i: number) => passedIndices.has(i));

      await prisma.problem.update({
        where: { id: parseInt(id) },
        data: {
          testCases: JSON.stringify(cleanedTestCases),
          verifiedAt: new Date(),
          verifiedCount: cleanedTestCases.length,
        },
      });

      return Response.json({
        message: `复核完成：${result.passed} 通过，${result.failed} 不一致已自动移除，剩余 ${cleanedTestCases.length} 个测试点`,
        model: VERIFY_MODEL_DISPLAY,
        ...result,
        remaining: cleanedTestCases.length,
      });
    }

    await prisma.problem.update({
      where: { id: parseInt(id) },
      data: {
        verifiedAt: new Date(),
        verifiedCount: result.total,
      },
    });

    return Response.json({
      message: `复核完成：全部 ${result.total} 个测试点均通过`,
      model: VERIFY_MODEL_DISPLAY,
      ...result,
      remaining: result.total,
    });
  } catch (e: any) {
    console.error("Verify error:", e);
    return Response.json({ error: e.message || "复核失败" }, { status: 500 });
  }
}
