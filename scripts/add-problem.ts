/**
 * 从洛谷拉取指定题目并直接添加到线上题库
 * 用法: npx tsx scripts/add-problem.ts <洛谷题号> [GESP级别]
 * 示例: npx tsx scripts/add-problem.ts P10720 5
 *
 * 首次运行需要输入管理员账号密码，token 会缓存到 scripts/.token
 */

import https from "https";
import http from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";

const SITE_URL = "https://gesp-ai-production.up.railway.app";
const TOKEN_FILE = "scripts/.token";

const pid = process.argv[2];
const levelArg = parseInt(process.argv[3] || "0");

if (!pid) {
  console.error("用法: npx tsx scripts/add-problem.ts <洛谷题号> [GESP级别]");
  console.error("示例: npx tsx scripts/add-problem.ts P10720 5");
  process.exit(1);
}

// ===== 工具函数 =====

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function fetchUrl(url: string, options?: any): Promise<{ status: number; body: string }> {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(url, options || {}, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", reject);
    if (options?.body) req.write(options.body);
    req.end();
  });
}

// ===== 登录获取 token =====

async function getToken(): Promise<string> {
  // 尝试读取缓存的 token
  if (existsSync(TOKEN_FILE)) {
    const cached = readFileSync(TOKEN_FILE, "utf-8").trim();
    // 验证 token 是否有效
    const check = await fetchUrl(`${SITE_URL}/api/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cached}` },
    });
    if (check.status === 200) {
      const user = JSON.parse(check.body);
      console.log(`已登录: ${user.username} (${user.role})`);
      if (user.role !== "admin") {
        console.error("错误: 该账号不是管理员");
        process.exit(1);
      }
      return cached;
    }
    console.log("缓存的 token 已过期，需要重新登录\n");
  }

  // 交互式登录
  const username = await ask("管理员用户名: ");
  const password = await ask("管理员密码: ");

  const res = await fetchUrl(`${SITE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (res.status !== 200) {
    const err = JSON.parse(res.body);
    console.error("登录失败:", err.error);
    process.exit(1);
  }

  const data = JSON.parse(res.body);
  if (data.user.role !== "admin") {
    console.error("错误: 该账号不是管理员");
    process.exit(1);
  }

  // 缓存 token
  writeFileSync(TOKEN_FILE, data.token, "utf-8");
  console.log(`登录成功: ${data.user.username}\n`);
  return data.token;
}

// ===== 从洛谷拉取题目 =====

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

async function fetchProblem(problemId: string) {
  console.log(`从洛谷拉取 ${problemId}...`);

  const { body: html } = await fetchUrl(`https://www.luogu.com.cn/problem/${problemId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.error("无法解析洛谷页面");
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
  let description: string, inputFormat: string, outputFormat: string;

  if (typeof c === "string") {
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
        else if (h.includes("样例")) key = "samples_md";
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
    description = ((c.background ? c.background + "\n\n" : "") + (c.description || "")).trim();
    inputFormat = (c.formatI || "").trim();
    outputFormat = (c.formatO || "").trim();
  }

  const samples = (p.samples || []).map((s: any) => ({
    input: String(s[0] ?? s.input ?? "").trim(),
    output: String(s[1] ?? s.output ?? "").trim(),
  }));

  return {
    luoguId: p.pid,
    title: p.title,
    level: levelArg || extractLevel(p.title, p.difficulty),
    description: description || "暂无描述",
    inputFormat: inputFormat || "暂无",
    outputFormat: outputFormat || "暂无",
    samples: JSON.stringify(samples),
    testCases: "[]",
  };
}

// ===== 主流程 =====

async function main() {
  const token = await getToken();
  const problem = await fetchProblem(pid);

  console.log(`\n题目: ${problem.title}`);
  console.log(`级别: ${problem.level}`);
  console.log(`样例数: ${JSON.parse(problem.samples).length}`);
  console.log(`描述长度: ${problem.description.length} 字符\n`);

  // 调用 API 添加题目
  console.log("正在添加到题库...");
  const res = await fetchUrl(`${SITE_URL}/api/admin/problems`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(problem),
  });

  const data = JSON.parse(res.body);

  if (res.status === 201) {
    console.log(`\n添加成功! 题目 ID: ${data.id}`);
    console.log(`查看: ${SITE_URL}/problems/${data.id}`);
  } else if (res.status === 409) {
    console.log("\n该题目已存在（luoguId 重复）");
  } else {
    console.error("\n添加失败:", data.error || JSON.stringify(data));
  }
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});
