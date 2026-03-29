import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";
import { normalizeOutput } from "./normalize";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const TESTGEN_MODEL = "claude-sonnet-4-6";
export const TESTGEN_MODEL_DISPLAY = "Claude Sonnet 4.6";

const FALLBACK_MODEL = "claude-opus-4-6";
const MAX_RETRIES = 3;

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

/** 健壮的 JSON 提取：先试 ```json 块，再试最外层 {} */
function extractJSON(text: string): any {
  // 策略1: 找最外层的 { 和最后一个 }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  // 策略2: ```json ... ``` 正则（fallback）
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock[1]);
    } catch {}
  }

  console.error("[TestGen] JSON 提取失败，原文前500字:", text.slice(0, 500));
  throw new Error("返回格式无法解析为 JSON");
}

/** 调用 Claude 并获取文本响应，使用 prefill 强制 JSON 输出 */
async function callModel(model: string, maxTokens: number, prompt: string): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "{" },
    ],
  });

  console.log(`[TestGen] API 返回: model=${response.model}, stop=${response.stop_reason}, tokens=${response.usage?.output_tokens}`);

  if (response.stop_reason === "max_tokens") throw new Error("生成被截断(max_tokens)");

  const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return "{" + text;
}

/** 第一步：生成两个独立 C++ 解法 */
async function generateSolutions(problem: Problem, model: string): Promise<{ solution1: string; solution2: string }> {
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
返回纯 JSON 对象（不要用 markdown 代码块包裹）。
C++ 代码中的换行用 \\n 表示，双引号用 \\" 转义。

{"solution1": "#include <iostream>\\nusing namespace std;\\nint main() {\\n...", "solution2": "#include <iostream>\\nusing namespace std;\\nint main() {\\n..."}`;

  console.log(`[TestGen] 生成解法，模型: ${model}`);
  const text = await callModel(model, 16000, prompt);

  const parsed = extractJSON(text);
  if (!parsed.solution1 || !parsed.solution2) throw new Error("解法数据不完整");
  if (parsed.solution1.length < 20) throw new Error(`解法1 太短(${parsed.solution1.length}字符)，可能解析错误`);
  if (parsed.solution2.length < 20) throw new Error(`解法2 太短(${parsed.solution2.length}字符)，可能解析错误`);

  return { solution1: parsed.solution1, solution2: parsed.solution2 };
}

/** 第二步：生成测试输入 */
async function generateInputs(problem: Problem, model: string): Promise<string[]> {
  const prompt = `你是算法竞赛出题人。请根据题目生成 15 组测试输入数据。

## 题目信息
${buildProblemContext(problem)}

## 要求
严格遵守题目的数据范围，生成以下类型的测试输入：
- 2-3 组最小边界（最小的 n、最小值等）
- 2-3 组最大边界
- 2-3 组特殊情况（全是同一个数、全是0、全是最大值等）
- 5-7 组随机中等规模数据

只需要输入数据，不需要输出。

## 重要：控制每组输入的长度
- 如果 n 代表数组长度/行数等，最大边界的 n 不要超过 100
- 中等规模数据的 n 取 10-50
- 每组输入要简洁，不要生成过长的数据

## 输出格式
返回纯 JSON 对象（不要用 markdown 代码块包裹）。
每组输入中的换行用 \\n 表示。

{"inputs": ["第1组输入", "第2组输入", ...]}`;

  console.log(`[TestGen] 生成输入，模型: ${model}`);
  const text = await callModel(model, 64000, prompt);

  const parsed = extractJSON(text);
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

      const output = normalizeOutput(result.stdout || "");
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
    const actual = normalizeOutput(result.stdout || "");
    const expected = normalizeOutput(samples[i].output);

    if (actual !== expected) {
      console.error(`[TestGen] ${label} 样例 ${i + 1} 验证失败！期望 "${expected.slice(0, 80)}"，实际 "${actual.slice(0, 80)}"`);
      return false;
    }

    if (i < samples.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return true;
}

/** 为一道题生成测试用例（主入口） */
export async function generateTestCases(problem: Problem): Promise<TestCase[]> {
  let lastError = "";

  // 先用 Sonnet 尝试 3 次
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[TestGen] "${problem.title}" 第 ${attempt} 次（Sonnet）...`);
      const result = await doGenerate(problem, TESTGEN_MODEL);
      if (result.length > 0) return result;
      lastError = "未能生成有效测试点";
    } catch (e: any) {
      lastError = e.message;
      console.error(`[TestGen] Sonnet 第 ${attempt} 次失败: ${lastError}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // Sonnet 全部失败，fallback 到 Opus 尝试 1 次
  try {
    console.log(`[TestGen] "${problem.title}" Sonnet 失败，尝试 Opus...`);
    const result = await doGenerate(problem, FALLBACK_MODEL);
    if (result.length > 0) return result;
  } catch (e: any) {
    console.error(`[TestGen] Opus 也失败: ${e.message}`);
  }

  throw new Error(`全部尝试失败: ${lastError}`);
}

async function doGenerate(problem: Problem, model: string): Promise<TestCase[]> {
  // 1. 生成解法和输入
  const { solution1, solution2 } = await generateSolutions(problem, model);
  console.log(`[TestGen] 解法1: ${solution1.length} 字符，解法2: ${solution2.length} 字符`);

  const inputs = await generateInputs(problem, model);
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
