/**
 * 从洛谷拉取指定题目并通过 API 添加到题库
 * 用法: npx tsx scripts/add-problem.ts <洛谷题号> <GESP级别>
 * 示例: npx tsx scripts/add-problem.ts P10720 5
 */

import https from "https";

const pid = process.argv[2];
const level = parseInt(process.argv[3] || "0");

if (!pid) {
  console.error("用法: npx tsx scripts/add-problem.ts <洛谷题号> <GESP级别>");
  console.error("示例: npx tsx scripts/add-problem.ts P10720 5");
  process.exit(1);
}

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let html = "";
      res.on("data", (c: Buffer) => (html += c));
      res.on("end", () => resolve(html));
      res.on("error", reject);
    });
  });
}

// 从标题提取 GESP 级别
const CN_LEVEL_MAP: Record<string, number> = {
  "一级": 1, "二级": 2, "三级": 3, "四级": 4,
  "五级": 5, "六级": 6, "七级": 7, "八级": 8,
};

function extractLevel(title: string, fallback: number): number {
  for (const [key, val] of Object.entries(CN_LEVEL_MAP)) {
    if (title.includes(key)) return val;
  }
  return fallback || 1;
}

async function main() {
  console.log(`正在从洛谷拉取 ${pid}...`);

  const html = await fetchHtml(`https://www.luogu.com.cn/problem/${pid}`);
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.error("无法解析页面数据");
    process.exit(1);
  }

  const data = JSON.parse(match[1]);
  const raw = data.currentData || data.data || data;
  const p = raw.problem;

  if (!p) {
    console.error("题目不存在");
    process.exit(1);
  }

  const c = p.content || {};

  // 处理 content：可能是字符串(markdown) 或结构化对象
  let description: string, inputFormat: string, outputFormat: string;

  if (typeof c === "string") {
    // markdown 格式，按标题切分
    const sections: Record<string, string> = {};
    let key = "description";
    for (const line of c.split("\n")) {
      const hm = line.match(/^#+\s*(.+)/);
      if (hm) {
        const h = hm[1].trim();
        if (h.includes("题目背景")) key = "background";
        else if (h.includes("题目描述")) key = "description";
        else if (h.includes("输入格式")) key = "inputFormat";
        else if (h.includes("输出格式")) key = "outputFormat";
        else if (h.includes("输入输出样例") || h.includes("样例")) key = "samples_md";
        else if (h.includes("说明") || h.includes("提示")) key = "hint";
        else key = h;
        continue;
      }
      sections[key] = (sections[key] || "") + line + "\n";
    }
    description = ((sections["background"] || "") + (sections["description"] || "")).trim();
    inputFormat = (sections["inputFormat"] || "").trim();
    outputFormat = (sections["outputFormat"] || "").trim();
  } else {
    // 结构化对象
    description = ((c.background ? c.background + "\n\n" : "") + (c.description || "")).trim();
    inputFormat = (c.formatI || "").trim();
    outputFormat = (c.formatO || "").trim();
  }

  // 样例
  const samples = (p.samples || []).map((s: any) => ({
    input: String(s[0] ?? s.input ?? "").trim(),
    output: String(s[1] ?? s.output ?? "").trim(),
  }));

  const finalLevel = level || extractLevel(p.title, p.difficulty);

  const problemData = {
    luoguId: p.pid,
    title: p.title,
    level: finalLevel,
    description: description || "暂无描述",
    inputFormat: inputFormat || "暂无",
    outputFormat: outputFormat || "暂无",
    samples: JSON.stringify(samples),
    testCases: "[]",
  };

  console.log("\n=== 题目信息 ===");
  console.log(`ID: ${problemData.luoguId}`);
  console.log(`标题: ${problemData.title}`);
  console.log(`级别: ${problemData.level}`);
  console.log(`描述: ${problemData.description.slice(0, 80)}...`);
  console.log(`输入格式: ${problemData.inputFormat.slice(0, 80)}...`);
  console.log(`输出格式: ${problemData.outputFormat.slice(0, 80)}...`);
  console.log(`样例数: ${samples.length}`);

  // 输出 JSON 供手动导入或 API 调用
  const outPath = `scripts/${pid.toLowerCase()}.json`;
  const { writeFileSync } = await import("fs");
  writeFileSync(outPath, JSON.stringify(problemData, null, 2), "utf-8");
  console.log(`\n数据已保存到 ${outPath}`);

  console.log("\n要添加到线上题库，请在浏览器控制台运行：");
  console.log(`
fetch('/api/admin/problems', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(problemData)})
}).then(r => r.json()).then(console.log)
  `.trim());
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});
