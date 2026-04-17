import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";
import { normalizeOutput } from "./normalize";
import { prisma } from "./prisma";
import { promptCache } from "./prompt-cache";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VERIFY_MODEL = "claude-opus-4-7";
const MAX_SOLUTION_RETRIES = 3;

export const DEFAULT_VARIANTVERIFY_SOLUTION_PROMPT = `请根据以下题目写一个完整正确的 C++ 解法。

## 题目信息
**标题**: {{title}}
**描述**: {{description}}
**输入格式**: {{input_format}}
**输出格式**: {{output_format}}
{{sample_text}}

## 重要
- 先仔细阅读每个样例，手动推演一遍
- 特别注意边界条件、计数方式、四舍五入规则
- 你的代码必须在所有样例上产生完全一致的输出

请调用 submit_solution 工具提交你的解法。`;

async function getVariantverifySolutionPrompt(): Promise<string> {
  return promptCache.get("variantverify_solution", async () => {
    try {
      const p = await prisma.prompt.findFirst({
        where: { category: "variantverify_solution" },
        orderBy: { updatedAt: "desc" },
      });
      if (p?.content) return p.content;
    } catch (e) {
      console.error("[VariantVerify] 加载提示词失败:", e);
    }
    return DEFAULT_VARIANTVERIFY_SOLUTION_PROMPT;
  });
}

interface VariantProblem {
  id: number;
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;   // JSON: [{input, output}]
  testCases: string;  // JSON: [{input, output}]
}

export interface SampleVerifyDetail {
  index: number;
  input: string;
  storedOutput: string;
  opusOutput: string;
  status: "pass" | "mismatch" | "error";
}

export interface TestCaseVerifyDetail {
  index: number;
  input: string;
  storedOutput: string;
  opusOutput: string;
  status: "pass" | "mismatch" | "error";
}

export interface VariantVerifyResult {
  variantId: number;
  title: string;
  /** 样例验证结果 */
  sampleTotal: number;
  samplePassed: number;
  sampleFixed: number;
  sampleDetails: SampleVerifyDetail[];
  /** 测试点验证结果 */
  testTotal: number;
  testPassed: number;
  testRemoved: number;
  testDetails: TestCaseVerifyDetail[];
  /** 最终状态 */
  status: "pass" | "fixed" | "failed";
  message: string;
  /** 修正后的数据（仅 status != "failed" 时有值） */
  fixedSamples?: string;
  fixedTestCases?: string;
}

/** 让 Opus 根据变形题题面写一个 C++ 解法 */
async function getOpusSolution(variant: VariantProblem): Promise<string> {
  const samples = JSON.parse(variant.samples || "[]");
  const sampleText = samples
    .map((s: { input: string; output: string }, i: number) =>
      `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`
    )
    .join("\n\n");

  const template = await getVariantverifySolutionPrompt();
  const prompt = template
    .replaceAll("{{title}}", variant.title)
    .replaceAll("{{description}}", variant.description)
    .replaceAll("{{input_format}}", variant.inputFormat)
    .replaceAll("{{output_format}}", variant.outputFormat)
    .replaceAll("{{sample_text}}", sampleText ? `**样例**:\n${sampleText}` : "");

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

  if (response.stop_reason === "max_tokens") throw new Error("生成被截断");

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("Opus 未返回工具调用");

  const { solution } = toolBlock.input as { solution: string };
  if (!solution || solution.length < 20) throw new Error("Opus 返回的代码太短");

  return solution;
}

/** 用解法跑一组输入，返回 normalizedOutput */
async function runOne(solution: string, input: string): Promise<{ output: string; ok: boolean }> {
  const result = await judgeCode(solution, input);
  if (result.status.id !== 3 && result.status.id !== 4) {
    return { output: result.stderr || result.compile_output || "运行错误", ok: false };
  }
  return { output: normalizeOutput(result.stdout || ""), ok: true };
}

/**
 * 复核一道变形题：
 * 1. Opus 写解法，用样例校验解法正确性（3 次重试）
 * 2. 用解法重跑所有样例，对比存储的 output → 不一致则修复
 * 3. 用解法重跑所有测试点，对比存储的 output → 不一致则移除
 */
export async function verifyVariant(variant: VariantProblem): Promise<VariantVerifyResult> {
  const samples: Array<{ input: string; output: string }> = JSON.parse(variant.samples || "[]");
  const testCases: Array<{ input: string; output: string }> = JSON.parse(variant.testCases || "[]");

  // ── 第一步：Opus 写解法 + 样例校验（重试 3 次）─────────────────────
  let solution = "";
  let solutionVerified = false;

  for (let attempt = 1; attempt <= MAX_SOLUTION_RETRIES; attempt++) {
    try {
      console.log(`[VariantVerify] "${variant.title}" 第 ${attempt} 次生成解法...`);
      solution = await getOpusSolution(variant);

      // 用已有样例验证解法
      let allMatch = true;
      for (let i = 0; i < samples.length; i++) {
        const { output, ok } = await runOne(solution, samples[i].input);
        const expected = normalizeOutput(samples[i].output);
        if (!ok || output !== expected) {
          console.warn(`[VariantVerify] 样例 ${i + 1} 不匹配（期望 "${expected.slice(0, 60)}"，实际 "${output.slice(0, 60)}"）`);
          allMatch = false;
          break;
        }
        if (i < samples.length - 1) await sleep(1500);
      }

      if (allMatch) {
        solutionVerified = true;
        break;
      }

      if (attempt < MAX_SOLUTION_RETRIES) {
        console.warn(`[VariantVerify] 第 ${attempt} 次样例不匹配，重试...`);
        await sleep(3000);
      }
    } catch (e: any) {
      console.error(`[VariantVerify] 第 ${attempt} 次失败: ${e.message}`);
      if (attempt < MAX_SOLUTION_RETRIES) await sleep(3000);
    }
  }

  // 如果 Opus 3 次都跑不过样例，这道题可能有问题
  if (!solutionVerified) {
    // 最后兜底：用解法跑样例，看看是解法错还是样例错
    // 让 Opus 再写一个不同思路的解法来交叉
    let solution2 = "";
    try {
      solution2 = await getOpusSolution(variant);
    } catch {
      return {
        variantId: variant.id,
        title: variant.title,
        sampleTotal: samples.length,
        samplePassed: 0,
        sampleFixed: 0,
        sampleDetails: [],
        testTotal: testCases.length,
        testPassed: 0,
        testRemoved: 0,
        testDetails: [],
        status: "failed",
        message: "Opus 多次无法生成通过样例的解法，该变形题可能存在题面问题",
      };
    }

    // 两个解法跑样例，看是否一致（如果两个解法一致但和存储不一致 → 样例错了，可以修复）
    const sampleDetails: SampleVerifyDetail[] = [];
    let canFix = true;
    const fixedSamples = [...samples];

    for (let i = 0; i < samples.length; i++) {
      const r1 = await runOne(solution, samples[i].input);
      await sleep(1500);
      const r2 = await runOne(solution2, samples[i].input);

      const stored = normalizeOutput(samples[i].output);

      if (r1.ok && r2.ok && r1.output === r2.output) {
        // 两个解法一致
        if (r1.output === stored) {
          sampleDetails.push({ index: i, input: samples[i].input, storedOutput: stored, opusOutput: r1.output, status: "pass" });
        } else {
          // 两个解法一致但和存储不一致 → 修复样例
          sampleDetails.push({ index: i, input: samples[i].input, storedOutput: stored, opusOutput: r1.output, status: "mismatch" });
          fixedSamples[i] = { input: samples[i].input, output: r1.output };
        }
      } else {
        // 两个解法不一致或运行失败 → 无法确定正确答案
        canFix = false;
        sampleDetails.push({ index: i, input: samples[i].input, storedOutput: stored, opusOutput: r1.output, status: "error" });
      }

      if (i < samples.length - 1) await sleep(1500);
    }

    if (!canFix) {
      return {
        variantId: variant.id,
        title: variant.title,
        sampleTotal: samples.length,
        samplePassed: sampleDetails.filter((d) => d.status === "pass").length,
        sampleFixed: 0,
        sampleDetails,
        testTotal: testCases.length,
        testPassed: 0,
        testRemoved: 0,
        testDetails: [],
        status: "failed",
        message: "Opus 两个解法不一致，无法确定正确答案，需人工检查",
      };
    }

    // 能修复样例的情况，用 solution 继续往下跑测试点
    solution = solution;
    // 标记后面用修复后的样例
    const sampleFixedCount = sampleDetails.filter((d) => d.status === "mismatch").length;

    // 跑测试点
    const testDetails = await verifyTestCases(solution, testCases);
    const testPassed = testDetails.filter((d) => d.status === "pass").length;
    const testRemoved = testDetails.filter((d) => d.status !== "pass").length;
    const cleanedTestCases = testCases.filter((_, i) =>
      testDetails.find((d) => d.index === i && d.status === "pass")
    );

    return {
      variantId: variant.id,
      title: variant.title,
      sampleTotal: samples.length,
      samplePassed: sampleDetails.filter((d) => d.status === "pass").length,
      sampleFixed: sampleFixedCount,
      sampleDetails,
      testTotal: testCases.length,
      testPassed,
      testRemoved,
      testDetails,
      status: "fixed",
      message: `修复了 ${sampleFixedCount} 个样例，移除了 ${testRemoved} 个测试点`,
      fixedSamples: JSON.stringify(fixedSamples),
      fixedTestCases: JSON.stringify(cleanedTestCases),
    };
  }

  // ── 第二步：解法通过样例校验，验证所有样例和测试点 ──────────────────

  // 重跑样例（虽然上面已验证过，但要记录详细结果）
  const sampleDetails: SampleVerifyDetail[] = [];
  for (let i = 0; i < samples.length; i++) {
    const stored = normalizeOutput(samples[i].output);
    const { output, ok } = await runOne(solution, samples[i].input);
    sampleDetails.push({
      index: i,
      input: samples[i].input,
      storedOutput: stored,
      opusOutput: output,
      status: ok && output === stored ? "pass" : "mismatch",
    });
    if (i < samples.length - 1) await sleep(1500);
  }

  // 跑测试点
  const testDetails = await verifyTestCases(solution, testCases);
  const testPassed = testDetails.filter((d) => d.status === "pass").length;
  const testRemoved = testDetails.filter((d) => d.status !== "pass").length;

  const allSampleOk = sampleDetails.every((d) => d.status === "pass");
  const cleanedTestCases = testCases.filter((_, i) =>
    testDetails.find((d) => d.index === i && d.status === "pass")
  );

  if (allSampleOk && testRemoved === 0) {
    return {
      variantId: variant.id,
      title: variant.title,
      sampleTotal: samples.length,
      samplePassed: samples.length,
      sampleFixed: 0,
      sampleDetails,
      testTotal: testCases.length,
      testPassed,
      testRemoved: 0,
      testDetails,
      status: "pass",
      message: `全部通过：${samples.length} 个样例 + ${testCases.length} 个测试点`,
    };
  }

  return {
    variantId: variant.id,
    title: variant.title,
    sampleTotal: samples.length,
    samplePassed: sampleDetails.filter((d) => d.status === "pass").length,
    sampleFixed: sampleDetails.filter((d) => d.status === "mismatch").length,
    sampleDetails,
    testTotal: testCases.length,
    testPassed,
    testRemoved,
    testDetails,
    status: "fixed",
    message: `修复了 ${sampleDetails.filter((d) => d.status === "mismatch").length} 个样例，移除了 ${testRemoved} 个测试点`,
    fixedSamples: !allSampleOk
      ? JSON.stringify(samples.map((s, i) => {
          const detail = sampleDetails[i];
          return detail.status === "mismatch"
            ? { input: s.input, output: detail.opusOutput }
            : s;
        }))
      : undefined,
    fixedTestCases: testRemoved > 0 ? JSON.stringify(cleanedTestCases) : undefined,
  };
}

/** 验证测试点，返回每个测试点的详细结果 */
async function verifyTestCases(
  solution: string,
  testCases: Array<{ input: string; output: string }>
): Promise<TestCaseVerifyDetail[]> {
  const details: TestCaseVerifyDetail[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[VariantVerify] 复核测试点 ${i + 1}/${testCases.length}...`);

    const stored = normalizeOutput(tc.output);
    const { output, ok } = await runOne(solution, tc.input);

    if (!ok) {
      details.push({ index: i, input: tc.input, storedOutput: stored, opusOutput: output, status: "error" });
    } else if (output === stored) {
      details.push({ index: i, input: tc.input, storedOutput: stored, opusOutput: output, status: "pass" });
    } else {
      details.push({ index: i, input: tc.input, storedOutput: stored, opusOutput: output, status: "mismatch" });
    }

    if (i < testCases.length - 1) await sleep(1500);
  }

  return details;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
