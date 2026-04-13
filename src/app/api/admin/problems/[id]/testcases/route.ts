import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/problems/:id/testcases — 获取题目的额外测试数据 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const problem = await prisma.problem.findUnique({
    where: { id: parseInt(id) },
    select: { testCases: true, samples: true },
  });

  if (!problem) return Response.json({ error: "题目不存在" }, { status: 404 });

  return Response.json({
    samples: JSON.parse(problem.samples || "[]"),
    testCases: JSON.parse(problem.testCases || "[]"),
  });
}

/** POST /api/admin/problems/:id/testcases — 添加额外测试点 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { testCases } = body; // Array<{input, output}>

    if (!Array.isArray(testCases)) {
      return Response.json({ error: "testCases 必须是数组" }, { status: 400 });
    }

    // 验证格式
    for (const tc of testCases) {
      if (typeof tc.input !== "string" || typeof tc.output !== "string") {
        return Response.json({ error: "每个测试点需要 input 和 output 字段" }, { status: 400 });
      }
    }

    const problem = await prisma.problem.findUnique({
      where: { id: parseInt(id) },
      select: { testCases: true },
    });

    if (!problem) return Response.json({ error: "题目不存在" }, { status: 404 });

    // 追加新测试点到现有的
    const existing: Array<{ input: string; output: string }> = JSON.parse(
      problem.testCases || "[]"
    );
    const merged = [...existing, ...testCases];

    await prisma.problem.update({
      where: { id: parseInt(id) },
      data: { testCases: JSON.stringify(merged) },
    });

    return Response.json({
      message: `添加了 ${testCases.length} 个测试点，共 ${merged.length} 个`,
      total: merged.length,
    });
  } catch (e: any) {
    return Response.json({ error: "添加失败: " + e.message }, { status: 500 });
  }
}

/** PUT /api/admin/problems/:id/testcases — 替换所有额外测试点 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { id } = await params;
    const { testCases } = await request.json();

    if (!Array.isArray(testCases)) {
      return Response.json({ error: "testCases 必须是数组" }, { status: 400 });
    }

    await prisma.problem.update({
      where: { id: parseInt(id) },
      data: { testCases: JSON.stringify(testCases) },
    });

    return Response.json({ message: `已设置 ${testCases.length} 个测试点` });
  } catch (e: any) {
    return Response.json({ error: "更新失败: " + e.message }, { status: 500 });
  }
}
