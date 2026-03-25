import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const VERIFY_MODEL = "claude-opus-4-20250514";
export const VERIFY_MODEL_DISPLAY = "Claude Opus 4";

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

/** 调 Opus 生成一个正确的 C++ 解法 */
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

## 要求
- 写一个完全正确的 C++ 程序，读 stdin 写 stdout
- 确保逻辑严谨，处理所有边界情况
- 只输出代码，不要任何解释

\`\`\`cpp
你的代码
\`\`\``;

  const response = await client.messages.create({
    model: VERIFY_MODEL,
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  const codeMatch = text.match(/```cpp\s*([\s\S]*?)```/) || text.match(/```c\+\+\s*([\s\S]*?)```/) || text.match(/```\s*(#include[\s\S]*?)```/);
  if (!codeMatch) {
    throw new Error("Opus 返回的代码无法解析");
  }

  return codeMatch[1].trim();
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

  // 1. 调 Opus 生成解法
  console.log(`[Verify] 调用 Opus 为 "${problem.title}" 生成解法...`);
  const solution = await getOpusSolution(problem);
  console.log(`[Verify] Opus 返回了 ${solution.length} 字符的解法`);

  // 2. 用全部样例验证 Opus 解法
  if (samples.length > 0) {
    console.log(`[Verify] 用 ${samples.length} 个样例验证 Opus 解法...`);
    for (let i = 0; i < samples.length; i++) {
      const result = await judgeCode(solution, samples[i].input);
      const actual = (result.stdout || "").replace(/\s+$/, "");
      const expected = samples[i].output.replace(/\s+$/, "");

      if (actual !== expected) {
        throw new Error(`Opus 解法样例 ${i + 1} 验证失败（期望 "${expected}"，实际 "${actual}"），无法进行复核`);
      }

      if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    console.log("[Verify] Opus 解法通过全部样例验证");
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

      const opusOutput = (result.stdout || "").replace(/\s+$/, "");
      const expectedOutput = tc.output.replace(/\s+$/, "");

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
