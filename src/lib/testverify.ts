import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";
import { normalizeOutput } from "./normalize";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const VERIFY_MODEL = "claude-opus-4-6";
export const VERIFY_MODEL_DISPLAY = "Claude Opus 4.6";

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
}

/** 调 Opus 生成一个正确的 C++ 解法（使用 tool_use 强制结构化输出） */
async function getOpusSolution(problem: Problem): Promise<string> {
  const samples = JSON.parse(problem.samples || "[]");
  const sampleText = samples
    .map((s: any, i: number) => `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`)
    .join("\n\n");

  const prompt = `请根据以下题目写一个正确的 C++ 解法。

## 题目信息
**标题**: ${problem.title}
**描述**: ${problem.description}
**输入格式**: ${problem.inputFormat}
**输出格式**: ${problem.outputFormat}
${sampleText ? `**样例**:\n${sampleText}` : ""}

## 重要：先验证样例
在写代码之前，请先仔细阅读每个样例，手动推演一遍输入到输出的完整过程。
特别注意：边界条件（是否包含端点）、计数方式（从0还是从1）、四舍五入规则等。

## 要求
- 写一个完全正确的 C++ 程序，读 stdin 写 stdout
- 确保逻辑严谨，处理所有边界情况

请调用 submit_solution 工具提交你的解法。`;

  console.log(`[Verify] 调用模型: ${VERIFY_MODEL}`);
  const response = await client.messages.stream({
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
    tool_choice: { type: "tool" as const, name: "submit_solution" },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();

  console.log(`[Verify] API 返回: model=${response.model}, stop=${response.stop_reason}, tokens=${response.usage?.output_tokens}`);

  if (response.stop_reason === "max_tokens") throw new Error("生成被截断(max_tokens)");

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("Opus 未返回工具调用");

  const input = toolBlock.input as { solution: string };
  if (!input.solution || input.solution.length < 20) throw new Error("Opus 返回的代码太短");

  return input.solution;
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
          throw new Error(`Opus 解法 ${MAX_SOLUTION_RETRIES} 次尝试均未通过样例验证，无法进行复核`);
        }

        console.log("[Verify] Opus 解法通过全部样例验证");
      }

      break; // 成功，跳出重试循环
    } catch (e: any) {
      if (attempt < MAX_SOLUTION_RETRIES && !e.message.includes("次尝试均未通过")) {
        console.warn(`[Verify] 第 ${attempt} 次失败: ${e.message}，重试...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw e;
    }
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
