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

/** 从洛谷 HTML 中提取 JSON 数据（支持两种嵌入格式） */
function extractJsonFromHtml(html: string): any {
  // 格式1: <script type="application/json">...</script> (题目页、列表页)
  const match1 = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (match1) return JSON.parse(match1[1]);

  // 格式2: window._feInjection = JSON.parse(decodeURIComponent("...")) (题单页)
  const match2 = html.match(/decodeURIComponent\("([^"]+)"\)/);
  if (match2) return JSON.parse(decodeURIComponent(match2[1]));

  console.error("洛谷页面无法解析，HTML前200字:", html.slice(0, 200));
  throw new Error("无法解析页面数据（洛谷可能返回了验证页面）");
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
  tags: string; // JSON: ["递推/递归", "动态规划"]
}

/** 拉取单道洛谷题目 */
export async function fetchLuoguProblem(
  luoguId: string,
  manualLevel?: number
): Promise<LuoguProblemData> {
  // 使用 _contentOnly=1 直接获取 JSON，其中 currentData.tags 包含完整标签字典
  const res = await fetch(`https://www.luogu.com.cn/problem/${luoguId}?_contentOnly=1`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!res.ok) throw new Error(`洛谷请求失败: HTTP ${res.status}`);

  const data = await res.json();
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

  // 提取算法标签
  // _contentOnly=1 模式下：p.tags = [id, ...], raw.tags = { "id": { name, ... } }
  const tagIds: number[] = Array.isArray(p.tags) ? p.tags.filter((t: any) => typeof t === "number") : [];
  const tagDict: Record<string, any> = raw.tags || {};
  const tagNames: string[] = tagIds
    .map((id) => tagDict[String(id)]?.name)
    .filter((n): n is string => !!n);

  return {
    luoguId: p.pid,
    title: p.title,
    level: manualLevel || extractLevel(p.title, p.difficulty),
    description: description || "暂无描述",
    inputFormat: inputFormat || "暂无",
    outputFormat: outputFormat || "暂无",
    samples: JSON.stringify(samples),
    testCases: "[]",
    tags: JSON.stringify(tagNames),
  };
}

/** 构造分页 URL */
function buildPageUrl(baseUrl: string, page: number): string {
  // 去掉 hash (#problems 等)
  const cleanUrl = baseUrl.split("#")[0];
  const u = new URL(cleanUrl);
  u.searchParams.set("page", String(page));
  return u.toString();
}

const LUOGU_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

/** 从洛谷题目列表页或题单页拉取所有题号 */
export async function fetchLuoguProblemList(url: string): Promise<string[]> {
  const cleanUrl = url.split("#")[0];

  // 判断是题单页还是列表页
  if (cleanUrl.includes("/training/")) {
    return fetchTrainingPids(cleanUrl);
  }
  return fetchProblemListPids(cleanUrl);
}

/** 题单页：/training/xxx */
async function fetchTrainingPids(url: string): Promise<string[]> {
  console.log(`[洛谷题单] 拉取: ${url}`);

  const res = await fetch(url, { headers: LUOGU_HEADERS });
  if (!res.ok) throw new Error(`洛谷请求失败: HTTP ${res.status}`);

  const html = await res.text();
  const data = extractJsonFromHtml(html);
  const raw = data.currentData || data.data || data;
  const training = raw?.training;

  if (!training?.problems?.length) {
    throw new Error("该题单没有找到题目");
  }

  const pids = training.problems.map((item: any) => item.problem?.pid || item.pid).filter(Boolean);
  console.log(`[洛谷题单] ${training.title}，共 ${pids.length} 道题`);
  return pids;
}

/** 列表页：/problem/list?... */
async function fetchProblemListPids(url: string): Promise<string[]> {
  const allPids: string[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const pageUrl = buildPageUrl(url, page);
    console.log(`[洛谷列表] 拉取第 ${page} 页: ${pageUrl}`);

    const res = await fetch(pageUrl, { headers: LUOGU_HEADERS });
    if (!res.ok) throw new Error(`洛谷请求失败: HTTP ${res.status}`);

    const html = await res.text();
    const data = extractJsonFromHtml(html);
    const raw = data.currentData || data.data || data;
    const problems = raw?.problems;

    if (!problems?.result?.length) {
      if (page === 1) throw new Error("该页面没有找到题目列表");
      break;
    }

    for (const p of problems.result) {
      allPids.push(p.pid);
    }

    totalPages = Math.ceil(problems.count / problems.perPage);
    console.log(`[洛谷列表] 第 ${page}/${totalPages} 页，获取 ${problems.result.length} 题，共 ${allPids.length}/${problems.count}`);

    page++;
    if (page <= totalPages) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return allPids;
}
