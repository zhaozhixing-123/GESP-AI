/**
 * 种子脚本：将 seed-data.json 导入数据库
 * 用法: npx tsx prisma/seed.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { join } from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

interface SeedProblem {
  luoguId: string;
  title: string;
  level: number;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
  testCases: string;
}

async function main() {
  const dataPath = join(__dirname, "seed-data.json");
  const raw = readFileSync(dataPath, "utf-8");
  const problems: SeedProblem[] = JSON.parse(raw);

  console.log(`导入 ${problems.length} 道题目...\n`);

  let created = 0;
  let updated = 0;

  for (const p of problems) {
    const result = await prisma.problem.upsert({
      where: { luoguId: p.luoguId },
      create: p,
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
    // upsert 没有直接告诉我们是 create 还是 update，简单计数
    created++;
  }

  console.log(`完成！处理了 ${created} 道题目`);

  const count = await prisma.problem.count();
  console.log(`数据库中共有 ${count} 道题目`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
