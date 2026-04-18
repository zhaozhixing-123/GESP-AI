import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { verifyTestCases, VERIFY_MODEL, VERIFY_MODEL_DISPLAY } from "@/lib/testverify";

/**
 * POST /api/admin/problems/[id]/review
 * 再复核：用 Opus 解法重跑全部测试点，但不删除任何 testCases。
 * 仅写入 reviewReport（JSON 快照）+ lastReviewedAt，供管理员人工审阅。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const problemId = parseInt(id);
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }

    const testCases = JSON.parse(problem.testCases || "[]");
    if (testCases.length === 0) {
      return Response.json({ error: "该题目没有测试数据，请先生成" }, { status: 400 });
    }

    const result = await verifyTestCases(
      {
        title: problem.title,
        description: problem.description,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        samples: problem.samples,
        testCases: problem.testCases,
      },
      false, // autoRemove=false：非破坏性再复核
    );

    const reviewedAt = new Date();
    const issues = result.details.filter((d) => d.status !== "pass");
    const report = {
      reviewedAt: reviewedAt.toISOString(),
      model: VERIFY_MODEL,
      modelDisplay: VERIFY_MODEL_DISPLAY,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      issues,
    };

    await prisma.problem.update({
      where: { id: problemId },
      data: {
        reviewReport: JSON.stringify(report),
        lastReviewedAt: reviewedAt,
      },
    });

    return Response.json({
      message:
        result.failed === 0
          ? `再复核完成：全部 ${result.total} 个测试点均通过`
          : `再复核完成：${result.passed} 通过，${result.failed} 不一致（未删除，请人工审阅）`,
      ...report,
    });
  } catch (e: any) {
    console.error("[Review]", e?.message ?? "unknown error");
    return Response.json({ error: e?.message || "再复核失败" }, { status: 500 });
  }
}
