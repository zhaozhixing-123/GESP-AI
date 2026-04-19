import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { verifyTestCases, VERIFY_MODEL, VERIFY_MODEL_DISPLAY } from "@/lib/testverify";

/**
 * POST /api/admin/variants/[id]/review
 * 再复核变形题：用 Opus 解法重跑全部测试点，但不删除任何 testCases 或 samples。
 * 仅写入 reviewReport（JSON 快照）+ lastReviewedAt。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const variantId = parseInt(id);
    const variant = await prisma.variantProblem.findUnique({ where: { id: variantId } });
    if (!variant) {
      return Response.json({ error: "变形题不存在" }, { status: 404 });
    }

    const testCases = JSON.parse(variant.testCases || "[]");
    if (testCases.length === 0) {
      return Response.json({ error: "该变形题没有测试数据" }, { status: 400 });
    }

    const result = await verifyTestCases(
      {
        title: variant.title,
        description: variant.description,
        inputFormat: variant.inputFormat,
        outputFormat: variant.outputFormat,
        samples: variant.samples,
        testCases: variant.testCases,
      },
      false,
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
      ...(result.status === "oracle_failed"
        ? { status: "oracle_failed" as const, reason: result.reason ?? "Opus 无法生成可信解法" }
        : {}),
    };

    await prisma.variantProblem.update({
      where: { id: variantId },
      data: {
        reviewReport: JSON.stringify(report),
        lastReviewedAt: reviewedAt,
      },
    });

    const message =
      result.status === "oracle_failed"
        ? `Opus 无法验证该变形题：${report.reason}`
        : result.failed === 0
          ? `再复核完成：全部 ${result.total} 个测试点均通过`
          : `再复核完成：${result.passed} 通过，${result.failed} 不一致（未删除，请人工审阅）`;

    return Response.json({ message, ...report });
  } catch (e: any) {
    console.error("[VariantReview]", e?.message ?? "unknown error");
    return Response.json({ error: e?.message || "再复核失败" }, { status: 500 });
  }
}
