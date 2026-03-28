import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const TESTGEN_MODEL = "claude-sonnet-4-6";
export const TESTGEN_MODEL_DISPLAY = "Claude Sonnet 4.6";

const MAX_RETRIES = 2;

interface Problem {
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: string;
}

interface TestCase {
  input: string;
  output: string;
}

function buildProblemContext(problem: Problem): string {
  const samples = JSON.parse(problem.samples || "[]");
  const sampleText = samples
    .map((s: any, i: number) => `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`)
    .join("\n\n");

  return `**标题**: ${problem.title}
**描述**: ${problem.description}
**输入格式**: ${problem.inputFormat}
**输出格式**: ${problem.outputFormat}
${sampleText ? `**样例**:\n${sampleText}` : ""}`;
}

/** 第一步：生成两个独立 C++ 解法 */
async function generateSolutions(problem: Problem): Promise<{ solution1: string; solution2: string }> {
  const prompt = `你是算法竞赛出题人。请根据题目写两个独立的 C++ 解法。

## 题目信息
${buildProblemContext(problem)}

## 任务
写两个完全独立的 C++ 解法，每个都能正确解决这道题。

### solution1（暴力法）
- 用最简单、最直接的方式
- 不追求效率，只追求正确性

### solution2（不同思路）
- 用与 solution1 不同的算法思路
- 同样必须正确

## 输出格式
严格输出 JSON，不要输出其他内容：
\`\`\`json
{
  "solution1": "完整C++代码",
  "solution2": "完整C++代码"
}
\`\`\`
代码中的换行用 \\n 表示。`;

  console.log(`[TestGen] 生成解法，模型: ${TESTGEN_MODEL}`);
  const response = await client.messages.stream({
    model: TESTGEN_MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();
  console.log(`[TestGen] 解法 API 返回: model=${response.model}, stop=${response.stop_reason}, usage=${JSON.stringify(response.usage)}`);

  if (response.stop_reason === "max_tokens") throw new Error("解法生成被截断");

  const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) throw new Error("解法返回格式无法解析");

  const parsed = JSON.parse(jsonMatch[1]);
  if (!parsed.solution1 || !parsed.solution2) throw new Error("解法数据不完整");

  return { solution1: parsed.solution1, solution2: parsed.solution2 };
}

/** 第二步：生成测试输入 */
async function generateInputs(problem: Problem): Promise<string[]> {
  const prompt = `你是算法竞赛出题人。请根据题目生成 18 组测试输入数据。

## 题目信息
${buildProblemContext(problem)}

## 要求
严格遵守题目的数据范围，生成以下类型的测试输入：
- 2-3 组最小边界（最小的 n、最小值等）
- 2-3 组最大边界（最大的 n、最大值等，不要超过数据范围）
- 2-3 组特殊情况（全是同一个数、全是0、全是最大值等）
- 8-10 组随机中等规模数据

只需要输入数据，不需要输出。

## 输出格式
严格输出 JSON，不要输出其他内容：
\`\`\`json
{
  "inputs": [
    "第1组输入",
    "第2组输入"
  ]
}
\`\`\`
每组输入中的换行用 \\n 表示。`;

  console.log(`[TestGen] 生成输入，模型: ${TESTGEN_MODEL}`);
  const response = await client.messages.stream({
    model: TESTGEN_MODEL,
    max_tokens: 32000,
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();
  console.log(`[TestGen] 输入 API 返回: model=${response.model}, stop=${response.stop_reason}, usage=${JSON.stringify(response.usage)}`);

  if (response.stop_reason === "max_tokens") throw new Error("输入生成被截断");

  const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) throw new Error("输入返回格式无法解析");

  const parsed = JSON.parse(jsonMatch[1]);
  if (!Array.isArray(parsed.inputs) || parsed.inputs.length === 0) throw new Error("输入数据不完整");

  return parsed.inputs;
}

/** 用 Judge0 运行一个解法，返回 input → output 映射 */
async function runSolution(
  label: string,
  solution: string,
  inputs: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i].trim();
    console.log(`[TestGen] ${label} 运行测试点 ${i + 1}/${inputs.length}...`);

    try {
      const result = await judgeCode(solution, input);

      if (result.status.id !== 3 && result.status.id !== 4) {
        console.error(`[TestGen] ${label} 测试点 ${i + 1} 运行失败: ${result.status.description}`);
        continue;
      }

      const output = (result.stdout || "").replace(/\s+$/, "");
      results.set(input, output);
    } catch (e: any) {
      console.error(`[TestGen] ${label} 测试点 ${i + 1} 异常: ${e.message}`);
    }

    if (i < inputs.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

/** 用全部样例验证一个解法 */
async function verifySolution(
  label: string,
  solution: string,
  samples: Array<{ input: string; output: string }>
): Promise<boolean> {
  for (let i = 0; i < samples.length; i++) {
    console.log(`[TestGen] ${label} 验证样例 ${i + 1}/${samples.length}...`);
    const result = await judgeCode(solution, samples[i].input);
    const actual = (result.stdout || "").replace(/\s+$/, "");
    const expected = samples[i].output.replace(/\s+$/, "");

    if (actual !== expected) {
      console.error(`[TestGen] ${label} 样例 ${i + 1} 验证失败！期望 "${expected}"，实际 "${actual}"`);
      return false;
    }

    if (i < samples.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return true;
}

/** 为一道题生成测试用例（主入口，带自动重试） */
export async function generateTestCases(problem: Problem): Promise<TestCase[]> {
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[TestGen] 开始为 "${problem.title}" 生成测试数据（第 ${attempt} 次）...`);
      const result = await doGenerate(problem);
      if (result.length > 0) return result;
      lastError = "未能生成有效测试点";
    } catch (e: any) {
      lastError = e.message;
      console.error(`[TestGen] 第 ${attempt} 次失败: ${lastError}`);
      if (attempt < MAX_RETRIES) {
        console.log("[TestGen] 等待 3 秒后重试...");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  throw new Error(`${MAX_RETRIES} 次尝试均失败: ${lastError}`);
}

async function doGenerate(problem: Problem): Promise<TestCase[]> {
  // 1. 分两步调用 Claude：先解法，再输入
  console.log("[TestGen] 第一步：生成双解法...");
  const { solution1, solution2 } = await generateSolutions(problem);
  console.log(`[TestGen] 解法1: ${solution1.length} 字符，解法2: ${solution2.length} 字符`);

  console.log("[TestGen] 第二步：生成测试输入...");
  const inputs = await generateInputs(problem);
  console.log(`[TestGen] 获得 ${inputs.length} 组输入`);

  // 2. 用全部样例验证两个解法
  const samples: Array<{ input: string; output: string }> = JSON.parse(problem.samples || "[]");

  if (samples.length > 0) {
    console.log("[TestGen] 验证解法1...");
    const ok1 = await verifySolution("解法1", solution1, samples);
    if (!ok1) throw new Error("解法1 样例验证失败");

    console.log("[TestGen] 验证解法2...");
    const ok2 = await verifySolution("解法2", solution2, samples);
    if (!ok2) throw new Error("解法2 样例验证失败");

    console.log("[TestGen] 两个解法均通过样例验证");
  }

  // 3. 用两个解法分别运行所有测试输入
  console.log("[TestGen] 解法1 运行测试输入...");
  const results1 = await runSolution("解法1", solution1, inputs);

  console.log("[TestGen] 解法2 运行测试输入...");
  const results2 = await runSolution("解法2", solution2, inputs);

  // 4. 交叉验证
  const testCases: TestCase[] = [];
  let mismatch = 0;

  for (const input of inputs) {
    const trimmed = input.trim();
    const out1 = results1.get(trimmed);
    const out2 = results2.get(trimmed);

    if (out1 === undefined || out2 === undefined) continue;

    if (out1 === out2) {
      testCases.push({ input: trimmed, output: out1 });
    } else {
      mismatch++;
      console.warn(`[TestGen] 不一致已丢弃：输入="${trimmed.slice(0, 50)}..." 解法1="${out1.slice(0, 30)}" 解法2="${out2.slice(0, 30)}"`);
    }
  }

  console.log(`[TestGen] 完成：${testCases.length} 个通过，${mismatch} 个不一致丢弃`);
  return testCases;
}
