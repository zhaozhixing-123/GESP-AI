import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const CN_LEVEL_MAP: Record<string, number> = {
  "一级": 1, "二级": 2, "三级": 3, "四级": 4,
  "五级": 5, "六级": 6, "七级": 7, "八级": 8,
};

function extractLevel(title: string, difficulty: number): number {
  for (const [key, val] of Object.entries(CN_LEVEL_MAP)) {
    if (title.includes(key)) return val;
  }
  return Math.min(difficulty, 8) || 1;
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const { luoguId, level: manualLevel } = await request.json();

    if (!luoguId) {
      return Response.json({ error: "请输入洛谷题号" }, { status: 400 });
    }

    // 检查是否已存在
    const existing = await prisma.problem.findUnique({ where: { luoguId } });
    if (existing) {
      return Response.json({ error: `题目 ${luoguId} 已存在（ID: ${existing.id}）` }, { status: 409 });
    }

    // 从洛谷拉取
    const res = await fetch(`https://www.luogu.com.cn/problem/${luoguId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });

    if (!res.ok) {
      return Response.json({ error: `洛谷请求失败: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      return Response.json({ error: "无法解析洛谷页面数据" }, { status: 502 });
    }

    const data = JSON.parse(match[1]);
    const raw = data.currentData || data.data || data;
    const p = raw?.problem;

    if (!p) {
      return Response.json({ error: "洛谷上找不到该题目" }, { status: 404 });
    }

    const c = p.content || {};
    let description: string, inputFormat: string, outputFormat: string;

    if (typeof c === "string") {
      // markdown 格式
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
      // 结构化对象
      description = ((c.background ? c.background + "\n\n" : "") + (c.description || "")).trim();
      inputFormat = (c.formatI || "").trim();
      outputFormat = (c.formatO || "").trim();
    }

    const samples = (p.samples || []).map((s: any) => ({
      input: String(s[0] ?? s.input ?? "").trim(),
      output: String(s[1] ?? s.output ?? "").trim(),
    }));

    const level = manualLevel || extractLevel(p.title, p.difficulty);

    const problem = await prisma.problem.create({
      data: {
        luoguId: p.pid,
        title: p.title,
        level,
        description: description || "暂无描述",
        inputFormat: inputFormat || "暂无",
        outputFormat: outputFormat || "暂无",
        samples: JSON.stringify(samples),
        testCases: "[]",
      },
    });

    return Response.json({
      message: "导入成功",
      problem: { id: problem.id, luoguId: problem.luoguId, title: problem.title, level: problem.level },
    }, { status: 201 });
  } catch (e: any) {
    console.error("Import error:", e);
    return Response.json({ error: "导入失败: " + e.message }, { status: 500 });
  }
}
