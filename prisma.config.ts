import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("WARNING: DATABASE_URL is not set. Available env vars:", Object.keys(process.env).filter(k => k.includes("DATABASE") || k.includes("POSTGRES") || k.includes("PG")).join(", "));
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url ?? "",
  },
});
