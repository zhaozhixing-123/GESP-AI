/**
 * 爬取洛谷 GESP 题目数据
 * 从 HTML 页面中提取 <script type="application/json"> 内的 JSON 数据
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE_URL = "https://www.luogu.com.cn";
const GESP_TAG = 355;
const DELAY_MS = 2000; // 请求间隔

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

const CN_LEVEL_MAP: Record<string, number> = {
  "一级": 1, "二级": 2, "三级": 3, "四级": 4,
  "五级": 5, "六级": 6, "七级": 7, "八级": 8,
  "1级": 1, "2级": 2, "3级": 3, "4级": 4,
  "5级": 5, "6级": 6, "7级": 7, "8级": 8,
};

function extractLevel(title: string, difficulty: number): number {
  for (const [key, val] of Object.entries(CN_LEVEL_MAP)) {
    if (title.includes(key)) return val;
  }
  return Math.min(difficulty, 8) || 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 从 HTML 中提取 <script type="application/json"> 标签内容 */
function extractJsonFromHtml(html: string): any {
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("找不到 application/json script 标签");
  return JSON.parse(match[1]);
}

async function fetchPageData(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  return extractJsonFromHtml(html);
}

function parseMarkdownContent(md: string): {
  description: string;
  inputFormat: string;
  outputFormat: string;
} {
  const sections: Record<string, string> = {};
  let currentKey = "description";
  const lines = md.split("\n");

  for (const line of lines) {
    const headerMatch = line.match(/^#+\s*(.+)/);
    if (headerMatch) {
      const h = headerMatch[1].trim();
      if (h.includes("题目描述") || h.includes("题目背景")) currentKey = "description";
      else if (h.includes("输入格式")) currentKey = "inputFormat";
      else if (h.includes("输出格式")) currentKey = "outputFormat";
      else if (h.includes("输入输出样例") || h.includes("样例")) currentKey = "samples";
      else if (h.includes("说明") || h.includes("提示")) currentKey = "hint";
      else currentKey = h;
      continue;
    }
    sections[currentKey] = (sections[currentKey] || "") + line + "\n";
  }

  return {
    description: (sections["description"] || "").trim(),
    inputFormat: (sections["inputFormat"] || "").trim(),
    outputFormat: (sections["outputFormat"] || "").trim(),
  };
}

async function main() {
  console.log("开始爬取洛谷 GESP 题目...\n");

  // 1. 获取题目列表
  const allItems: any[] = [];
  let page = 1;
  while (true) {
    console.log(`爬取题目列表第 ${page} 页...`);
    const data = await fetchPageData(
      `${BASE_URL}/problem/list?tag=${GESP_TAG}&type=B&page=${page}`
    );
    const problems = data?.currentData?.problems ?? data?.data?.problems;
    if (!problems?.result?.length) break;

    allItems.push(...problems.result);
    console.log(`  获取 ${problems.result.length} 道题，共 ${allItems.length}/${problems.count}`);

    if (allItems.length >= problems.count) break;
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`\n共找到 ${allItems.length} 道 GESP 题目\n`);

  // 2. 逐个获取详情
  const seedData: SeedProblem[] = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    console.log(`[${i + 1}/${allItems.length}] ${item.pid}: ${item.title}`);

    try {
      const data = await fetchPageData(`${BASE_URL}/problem/${item.pid}`);
      const raw = data?.currentData ?? data?.data ?? data;
      const problem = raw?.problem;
      const content = problem?.content ?? "";

      // 解析内容
      let parsed: { description: string; inputFormat: string; outputFormat: string };
      let hint = "";

      if (typeof content === "string") {
        const md = parseMarkdownContent(content);
        parsed = md;
      } else {
        parsed = {
          description: content?.description || "",
          inputFormat: content?.formatI || "",
          outputFormat: content?.formatO || "",
        };
        hint = content?.hint || "";
      }

      // 将说明/提示追加到描述
      let fullDescription = (parsed.description || "").trim();
      if (hint) {
        fullDescription += "\n\n## 说明/提示\n\n" + hint.trim();
      }

      // 获取样例
      let samples: Array<{ input: string; output: string }> = [];
      const rawSamples = problem?.samples;
      if (Array.isArray(rawSamples)) {
        samples = rawSamples.map((s: any) => ({
          input: String(s[0] ?? s.input ?? "").trim(),
          output: String(s[1] ?? s.output ?? "").trim(),
        }));
      }

      seedData.push({
        luoguId: item.pid,
        title: item.title,
        level: extractLevel(item.title, item.difficulty),
        description: fullDescription || "暂无描述",
        inputFormat: parsed.inputFormat || "暂无",
        outputFormat: parsed.outputFormat || "暂无",
        samples: JSON.stringify(samples),
        testCases: JSON.stringify([]),
      });
      success++;
    } catch (err: any) {
      console.error(`  失败: ${err.message}`);
      failed++;
    }

    if (i < allItems.length - 1) await sleep(DELAY_MS);
  }

  // 3. 保存
  const outDir = join(process.cwd(), "prisma");
  const outPath = join(outDir, "seed-data.json");
  writeFileSync(outPath, JSON.stringify(seedData, null, 2), "utf-8");

  console.log(`\n完成！成功 ${success} 题，失败 ${failed} 题`);
  console.log(`数据保存到 ${outPath}`);
}

main().catch(console.error);
