// 在 prisma migrate deploy 之前运行
// 自动将所有"开始了但未完成"的迁移标记为 rolled-back
// 这样 Prisma 才肯重新执行它们
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(`
      UPDATE "_prisma_migrations"
      SET rolled_back_at = NOW()
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
      RETURNING migration_name
    `);

    if (rows.length > 0) {
      console.log(
        "Auto-resolved failed migrations:",
        rows.map((r) => r.migration_name).join(", ")
      );
    }
  } catch (e) {
    // _prisma_migrations 不存在说明是全新数据库，直接跳过
    if (e.code !== "42P01") throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("resolve-failed-migrations error:", e.message);
  process.exit(1);
});
