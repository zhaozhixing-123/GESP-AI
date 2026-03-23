import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import seedData from "../../../../../prisma/seed-data.json";

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const problems = seedData as any[];
    let count = 0;

    for (const p of problems) {
      await prisma.problem.upsert({
        where: { luoguId: p.luoguId },
        create: {
          luoguId: p.luoguId,
          title: p.title,
          level: p.level,
          description: p.description,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          samples: p.samples,
          testCases: p.testCases,
        },
        update: {
          title: p.title,
          level: p.level,
          description: p.description,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          samples: p.samples,
          testCases: p.testCases,
        },
      });
      count++;
    }

    const total = await prisma.problem.count();
    return Response.json({ message: `导入完成，处理 ${count} 题，数据库共 ${total} 题` });
  } catch (e: any) {
    console.error("Seed error:", e);
    return Response.json({ error: "导入失败: " + e.message }, { status: 500 });
  }
}
