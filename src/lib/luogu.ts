/** 洛谷题目拉取工具 */

const CN_LEVEL_MAP: Record<string, number> = {
  "一级": 1, "二级": 2, "三级": 3, "四级": 4,
  "五级": 5, "六级": 6, "七级": 7, "八级": 8,
};

export function extractLevel(title: string, difficulty: number): number {
  for (const [key, val] of Object.entries(CN_LEVEL_MAP)) {
    if (title.includes(key)) return val;
  }
  return Math.min(difficulty, 8) || 1;
}

/** 从洛谷 HTML 中提取 JSON 数据 */
function extractJsonFromHtml(html: string): any {
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("无法解析页面数据");
  return JSON.parse(match[1]);
}

export interface LuoguProblemData {
  luoguId: string;
  title: string;
  level: number;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
  testCases: string;
}

/** 拉取单道洛谷题目 */
export async function fetchLuoguProblem(
  luoguId: string,
  manualLevel?: number
): Promise<LuoguProblemData> {
  const res = await fetch(`https://www.luogu.com.cn/problem/${luoguId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!res.ok) throw new Error(`洛谷请求失败: HTTP ${res.status}`);

  const html = await res.text();
  const data = extractJsonFromHtml(html);
  const raw = data.currentData || data.data || data;
  const p = raw?.problem;

  if (!p) throw new Error("洛谷上找不到该题目");

  const c = p.content || {};
  let description: string, inputFormat: string, outputFormat: string, hint: string;

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
    hint = (sections["hint"] || "").trim();
  } else {
    description = ((c.background ? c.background + "\n\n" : "") + (c.description || "")).trim();
    inputFormat = (c.formatI || "").trim();
    outputFormat = (c.formatO || "").trim();
    hint = (c.hint || "").trim();
  }

  if (hint) {
    description = description + "\n\n## 说明/提示\n\n" + hint;
  }

  const samples = (p.samples || []).map((s: any) => ({
    input: String(s[0] ?? s.input ?? "").trim(),
    output: String(s[1] ?? s.output ?? "").trim(),
  }));

  return {
    luoguId: p.pid,
    title: p.title,
    level: manualLevel || extractLevel(p.title, p.difficulty),
    description: description || "暂无描述",
    inputFormat: inputFormat || "暂无",
    outputFormat: outputFormat || "暂无",
    samples: JSON.stringify(samples),
    testCases: "[]",
  };
}

/** 从洛谷题目列表页拉取所有题号 */
export async function fetchLuoguProblemList(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!res.ok) throw new Error(`洛谷请求失败: HTTP ${res.status}`);

  const html = await res.text();
  const data = extractJsonFromHtml(html);
  const raw = data.currentData || data.data || data;
  const problems = raw?.problems;

  if (!problems?.result?.length) {
    throw new Error("该页面没有找到题目列表");
  }

  const allPids: string[] = [];
  const totalPages = Math.ceil(problems.count / problems.perPage);

  // 第一页的结果
  for (const p of problems.result) {
    allPids.push(p.pid);
  }

  // 后续页
  for (let page = 2; page <= totalPages; page++) {
    const pageUrl = url.includes("?")
      ? url.replace(/([?&])page=\d+/, `$1page=${page}`).replace(url, url + `&page=${page}`)
      : url + `?page=${page}`;

    // 确保 page 参数存在
    const finalUrl = pageUrl.includes("page=") ? pageUrl : pageUrl + (pageUrl.includes("?") ? "&" : "?") + `page=${page}`;

    const pageRes = await fetch(finalUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!pageRes.ok) break;

    const pageHtml = await pageRes.text();
    const pageData = extractJsonFromHtml(pageHtml);
    const pageRaw = pageData.currentData || pageData.data || pageData;
    const pageProblems = pageRaw?.problems?.result || [];
    for (const p of pageProblems) {
      allPids.push(p.pid);
    }

    // 避免请求太快
    await new Promise((r) => setTimeout(r, 1000));
  }

  return allPids;
}
