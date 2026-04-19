import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";
import { logLlmError, logLlmSuccess } from "./llmCost";
import { normalizeOutput } from "./normalize";
import { prisma } from "./prisma";
import { promptCache } from "./prompt-cache";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const VERIFY_MODEL = "claude-opus-4-7";
export const VERIFY_MODEL_DISPLAY = "Claude Opus 4.7";

export const DEFAULT_TESTVERIFY_SOLUTION_PROMPT = `请根据以下题目写一个正确的 C++ 解法。

## 题目信息
**标题**: {{title}}
**描述**: {{description}}
**输入格式**: {{input_format}}
**输出格式**: {{output_format}}
{{sample_text}}

## 重要：先验证样例
在写代码之前，请先仔细阅读每个样例，手动推演一遍输入到输出的完整过程。
特别注意：边界条件（是否包含端点）、计数方式（从0还是从1）、四舍五入规则等。

## 要求
- 写一个完全正确的 C++ 程序，读 stdin 写 stdout
- 确保逻辑严谨，处理所有边界情况

请调用 submit_solution 工具提交你的解法。`;

async function getTestverifySolutionPrompt(): Promise<string> {
  return promptCache.get("testverify_solution", async () => {
    try {
      const p = await prisma.prompt.findFirst({
        where: { category: "testverify_solution" },
        orderBy: { updatedAt: "desc" },
      });
      if (p?.content) return p.content;
    } catch (e) {
      console.error("[Verify] 加载提示词失败:", e);
    }
    return DEFAULT_TESTVERIFY_SOLUTION_PROMPT;
  });
}

interface Problem {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
  testCases: string;
}

interface VerifyResult {
  total: number;
  passed: number;
  failed: number;
  removed: number;
  details: Array<{
    index: number;
    input: string;
    expectedOutput: string;
    opusOutput: string;
    status: "pass" | "mismatch" | "error";
  }>;
  /** 顶层状态：当 Opus 无法生成可信解法时填 "oracle_failed"，否则留空 */
  status?: "oracle_failed";
  /** oracle_failed 时的简短原因，用于 UI 展示 */
  reason?: string;
}

/** 调 Opus 生成 C++ 解法。不强制 tool_choice：优先读 tool_use，兜底从 text 围栏提取。 */
async function getOpusSolution(problem: Problem): Promise<string> {
  const samples = JSON.parse(problem.samples || "[]");
  const sampleText = samples
    .map((s: any, i: number) => `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`)
    .join("\n\n");

  const template = await getTestverifySolutionPrompt();
  const prompt = template
    .replaceAll("{{title}}", problem.title)
    .replaceAll("{{description}}", problem.description)
    .replaceAll("{{input_format}}", problem.inputFormat)
    .replaceAll("{{output_format}}", problem.outputFormat)
    .replaceAll("{{sample_text}}", sampleText ? `**样例**:\n${sampleText}` : "");

  console.log(`[Verify] 调用模型: ${VERIFY_MODEL}`);
  const startedAt = Date.now();
  let response;
  try {
    response = await client.messages.stream({
      model: VERIFY_MODEL,
      max_tokens: 16000,
      tools: [{
        name: "submit_solution",
        description: "提交 C++ 解法",
        input_schema: {
          type: "object" as const,
          properties: {
            solution: { type: "string", description: "完整的 C++ 代码" },
          },
          required: ["solution"],
        },
        cache_control: { type: "ephemeral" as const },
      }],
      messages: [{ role: "user", content: prompt }],
    }, { timeout: 180_000, maxRetries: 1 }).finalMessage();
  } catch (e) {
    await logLlmError({ purpose: "testverify", model: VERIFY_MODEL, error: e, startedAt });
    throw e;
  }

  await logLlmSuccess({
    purpose: "testverify",
    model: response.model || VERIFY_MODEL,
    usage: response.usage,
    startedAt,
  });

  console.log(`[Verify] API 返回: model=${response.model}, stop=${response.stop_reason}, tokens=${response.usage?.output_tokens}`);

  if (response.stop_reason === "max_tokens") throw new Error("生成被截断(max_tokens)");

  // 优先从 tool_use 里取代码
  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (toolBlock && toolBlock.type === "tool_use") {
    const input = toolBlock.input as { solution?: string };
    if (input.solution && input.solution.length >= 20) return input.solution;
  }

  // 兜底：从 text 里的 ```cpp ... ``` 围栏提取
  const textBlock = response.content.find((c) => c.type === "text");
  if (textBlock && textBlock.type === "text") {
    const match = textBlock.text.match(/```(?:cpp|c\+\+)?\s*\n([\s\S]+?)\n```/i);
    if (match && match[1].trim().length >= 20) return match[1];
  }

  throw new Error("Opus 未返回可用解法");
}

/** 用 Opus 解法验证所有测试用例 */
export async function verifyTestCases(
  problem: Problem,
  autoRemove: boolean = true
): Promise<VerifyResult> {
  const testCases: Array<{ input: string; output: string }> = JSON.parse(problem.testCases || "[]");
  const samples: Array<{ input: string; output: string }> = JSON.parse(problem.samples || "[]");

  if (testCases.length === 0) {
    throw new Error("该题目没有测试数据");
  }

  // 1. 调 Opus 生成解法（带重试）
  const MAX_SOLUTION_RETRIES = 3;
  let solution = "";
  let solutionReady = false;
  let lastFailureReason = "";

  for (let attempt = 1; attempt <= MAX_SOLUTION_RETRIES; attempt++) {
    try {
      console.log(`[Verify] 第 ${attempt} 次为 "${problem.title}" 生成解法...`);
      solution = await getOpusSolution(problem);
      console.log(`[Verify] Opus 返回了 ${solution.length} 字符的解法`);

      // 2. 用全部样例验证 Opus 解法
      if (samples.length > 0) {
        console.log(`[Verify] 用 ${samples.length} 个样例验证 Opus 解法...`);
        let samplePassed = true;
        for (let i = 0; i < samples.length; i++) {
          const result = await judgeCode(solution, samples[i].input);
          const actual = normalizeOutput(result.stdout || "");
          const expected = normalizeOutput(samples[i].output);

          if (actual !== expected) {
            console.error(`[Verify] 样例 ${i + 1} 验证失败（期望 "${expected.slice(0, 80)}"，实际 "${actual.slice(0, 80)}"）`);
            samplePassed = false;
            lastFailureReason = `样例 ${i + 1} 不一致（期望 "${expected.slice(0, 60)}"，Opus 输出 "${actual.slice(0, 60)}"）`;
            break;
          }

          if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 1500));
        }

        if (!samplePassed) {
          if (attempt < MAX_SOLUTION_RETRIES) {
            console.warn(`[Verify] 第 ${attempt} 次样例验证失败，重试...`);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          // 3 次均未通过样例 → 标记 oracle_failed，不阻塞上游流程
          break;
        }

        console.log("[Verify] Opus 解法通过全部样例验证");
      }

      solutionReady = true;
      break; // 成功，跳出重试循环
    } catch (e: any) {
      lastFailureReason = e?.message ?? "生成解法失败";
      if (attempt < MAX_SOLUTION_RETRIES) {
        console.warn(`[Verify] 第 ${attempt} 次失败: ${lastFailureReason}，重试...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      // 3 次都失败 → 标记 oracle_failed
      console.warn(`[Verify] ${MAX_SOLUTION_RETRIES} 次均失败: ${lastFailureReason}`);
    }
  }

  if (!solutionReady) {
    return {
      total: testCases.length,
      passed: 0,
      failed: 0,
      removed: 0,
      details: [],
      status: "oracle_failed",
      reason: lastFailureReason || "Opus 无法生成可信解法",
    };
  }

  // 3. 用 Opus 解法跑所有测试点
  const details: VerifyResult["details"] = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[Verify] 复核测试点 ${i + 1}/${testCases.length}...`);

    try {
      const result = await judgeCode(solution, tc.input);

      if (result.status.id !== 3 && result.status.id !== 4) {
        // 运行出错
        details.push({
          index: i,
          input: tc.input,
          expectedOutput: tc.output,
          opusOutput: result.stderr || result.compile_output || "运行错误",
          status: "error",
        });
        failed++;
        continue;
      }

      const opusOutput = normalizeOutput(result.stdout || "");
      const expectedOutput = normalizeOutput(tc.output);

      if (opusOutput === expectedOutput) {
        details.push({
          index: i,
          input: tc.input,
          expectedOutput,
          opusOutput,
          status: "pass",
        });
        passed++;
      } else {
        details.push({
          index: i,
          input: tc.input,
          expectedOutput,
          opusOutput,
          status: "mismatch",
        });
        failed++;
      }
    } catch (e: any) {
      details.push({
        index: i,
        input: tc.input,
        expectedOutput: tc.output,
        opusOutput: e.message,
        status: "error",
      });
      failed++;
    }

    if (i < testCases.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 4. 如果有错误且 autoRemove，自动删除不一致的测试点
  let removed = 0;
  if (autoRemove && failed > 0) {
    const passedIndices = new Set(details.filter((d) => d.status === "pass").map((d) => d.index));
    const cleanedTestCases = testCases.filter((_, i) => passedIndices.has(i));
    removed = testCases.length - cleanedTestCases.length;
    console.log(`[Verify] 自动移除 ${removed} 个不一致的测试点，保留 ${cleanedTestCases.length} 个`);

    // 返回清理后的数据，由调用方决定是否保存
    return {
      total: testCases.length,
      passed,
      failed,
      removed,
      details,
    };
  }

  console.log(`[Verify] 复核完成：${passed} 通过，${failed} 不一致`);

  return {
    total: testCases.length,
    passed,
    failed,
    removed: 0,
    details,
  };
}
