import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";
import { normalizeOutput } from "./normalize";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const VARIANTGEN_MODEL = "claude-sonnet-4-6";
const FALLBACK_MODEL = "claude-opus-4-6";
const MAX_RETRIES = 3;

interface SourceProblem {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string; // JSON string
  tags: string;    // JSON string
  level: number;
}

export interface VariantDraft {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string; // JSON string: [{input, output}]
  tags: string;
  level: number;
}

function buildSourceContext(source: SourceProblem): string {
  const samples = JSON.parse(source.samples || "[]");
  const sampleText = samples
    .map((s: { input: string; output: string }, i: number) =>
      `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`
    )
    .join("\n\n");

  const tags: string[] = JSON.parse(source.tags || "[]");

  return `**标题**: ${source.title}
**级别**: GESP ${source.level} 级
**知识点**: ${tags.join("、") || "无标签"}
**描述**: ${source.description}
**输入格式**: ${source.inputFormat}
**输出格式**: ${source.outputFormat}
${sampleText ? `**样例**:\n${sampleText}` : ""}`;
}

/** 调用 Claude（tool_use 强制结构化）生成变形题题面 */
async function callGenerateVariant(
  source: SourceProblem,
  model: string
): Promise<VariantDraft> {
  const prompt = `你是一名 GESP 算法竞赛出题人，请根据下面的原题，设计一道"变形题"。

## 原题信息
${buildSourceContext(source)}

## 变形题要求
1. **保持相同的算法思路和知识点**，但改变题目的情境、故事背景、变量名称，以及部分数值参数
2. 难度和 GESP 级别保持不变（${source.level} 级）
3. 生成 2~3 组样例，每组样例必须手动推算正确的输出
4. 输入输出格式可以调整，但整体复杂度相近
5. 题目描述完整，不能引用原题，不能出现"原题"等字眼

## 样例要求
在生成样例之前，请先自行用纸笔推算每组样例的正确答案，确保 input → output 完全正确。

请调用 submit_variant 工具提交你的变形题。`;

  console.log(`[VariantGen] 生成题面，模型: ${model}`);
  const response = await client.messages.stream({
    model,
    max_tokens: 8000,
    tools: [
      {
        name: "submit_variant",
        description: "提交变形题题面",
        input_schema: {
          type: "object" as const,
          properties: {
            title:        { type: "string", description: "变形题标题" },
            description:  { type: "string", description: "题目描述（Markdown）" },
            inputFormat:  { type: "string", description: "输入格式说明" },
            outputFormat: { type: "string", description: "输出格式说明" },
            samples: {
              type: "array",
              description: "2~3 组样例，每组 {input, output}",
              items: {
                type: "object",
                properties: {
                  input:  { type: "string" },
                  output: { type: "string" },
                },
                required: ["input", "output"],
              },
            },
          },
          required: ["title", "description", "inputFormat", "outputFormat", "samples"],
        },
      },
    ],
    tool_choice: { type: "tool" as const, name: "submit_variant" },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();

  if (response.stop_reason === "max_tokens") throw new Error("生成被截断(max_tokens)");

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("模型未返回工具调用");

  const raw = toolBlock.input as {
    title: string;
    description: string;
    inputFormat: string;
    outputFormat: string;
    samples: Array<{ input: string; output: string }>;
  };

  if (!raw.title || !raw.description || !raw.inputFormat || !raw.outputFormat) {
    throw new Error("变形题字段不完整");
  }
  if (!Array.isArray(raw.samples) || raw.samples.length < 2) {
    throw new Error(`样例数量不足（${raw.samples?.length ?? 0} 组，需要至少 2 组）`);
  }

  const tags: string[] = JSON.parse(source.tags || "[]");

  return {
    title:        raw.title,
    description:  raw.description,
    inputFormat:  raw.inputFormat,
    outputFormat: raw.outputFormat,
    samples:      JSON.stringify(raw.samples),
    tags:         JSON.stringify(tags),
    level:        source.level,
  };
}

/** 用 judge0 验证变形题样例是否自洽（AI 写一个解法跑一遍） */
async function verifySamples(draft: VariantDraft, model: string): Promise<void> {
  const samples: Array<{ input: string; output: string }> = JSON.parse(draft.samples);

  // 让 AI 根据题面写一个正确解法
  const prompt = `请根据以下题目写一个完整正确的 C++ 解法。

## 题目
**标题**: ${draft.title}
**描述**: ${draft.description}
**输入格式**: ${draft.inputFormat}
**输出格式**: ${draft.outputFormat}

请调用 submit_solution 工具提交代码。`;

  const response = await client.messages.stream({
    model,
    max_tokens: 8000,
    tools: [
      {
        name: "submit_solution",
        description: "提交 C++ 解法",
        input_schema: {
          type: "object" as const,
          properties: {
            solution: { type: "string", description: "完整 C++ 代码" },
          },
          required: ["solution"],
        },
      },
    ],
    tool_choice: { type: "tool" as const, name: "submit_solution" },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("模型未返回解法");

  const { solution } = toolBlock.input as { solution: string };
  if (!solution || solution.length < 20) throw new Error("解法太短");

  // 逐一验证样例
  for (let i = 0; i < samples.length; i++) {
    console.log(`[VariantGen] 验证样例 ${i + 1}/${samples.length}...`);
    const result = await judgeCode(solution, samples[i].input);
    const actual   = normalizeOutput(result.stdout || "");
    const expected = normalizeOutput(samples[i].output);

    if (actual !== expected) {
      throw new Error(
        `样例 ${i + 1} 不一致：期望 "${expected.slice(0, 60)}"，实际 "${actual.slice(0, 60)}"`
      );
    }

    if (i < samples.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log("[VariantGen] 所有样例验证通过");
}

/** 主函数：生成一道变形题（含样例验证），失败时自动重试 */
export async function generateVariantProblem(source: SourceProblem): Promise<VariantDraft> {
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[VariantGen] "${source.title}" 第 ${attempt} 次（Sonnet）...`);
      const draft = await callGenerateVariant(source, VARIANTGEN_MODEL);
      await verifySamples(draft, VARIANTGEN_MODEL);
      return draft;
    } catch (e: any) {
      lastError = e.message;
      console.error(`[VariantGen] Sonnet 第 ${attempt} 次失败: ${lastError}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // 全部 Sonnet 失败，用 Opus fallback 一次
  try {
    console.log(`[VariantGen] "${source.title}" Sonnet 全败，尝试 Opus...`);
    const draft = await callGenerateVariant(source, FALLBACK_MODEL);
    await verifySamples(draft, FALLBACK_MODEL);
    return draft;
  } catch (e: any) {
    console.error(`[VariantGen] Opus 也失败: ${e.message}`);
  }

  throw new Error(`变形题生成全部失败: ${lastError}`);
}
