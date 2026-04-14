/**
 * 临时脚本：重置管理员密码
 * 用法: npx tsx prisma/reset-admin.ts
 * 用完即删
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { join } from "path";

dotenv.config({ path: join(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.user.update({
    where: { email: "momoai20251210@gmail.com" },
    data: {
      passwordHash: "$2b$10$GSwKhh5HdUfW5mfoNfwVUeAh979Ie4w2f7UzUvO25AG06RLHjaS4m",
    },
    select: { id: true, email: true, nickname: true, role: true },
  });
  console.log("密码已更新:", result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
