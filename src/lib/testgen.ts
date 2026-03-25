import Anthropic from "@anthropic-ai/sdk";
import { judgeCode } from "./judge0";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const TESTGEN_MODEL = "claude-sonnet-4-20250514";
export const TESTGEN_MODEL_DISPLAY = "Claude Sonnet 4";

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

/** 调用 Claude 生成两个独立解法和测试输入 */
async function callClaude(problem: Problem): Promise<{
  solution1: string;
  solution2: string;
  inputs: string[];
}> {
  const samples = JSON.parse(problem.samples || "[]");
  const sampleText = samples
    .map((s: any, i: number) => `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`)
    .join("\n\n");

  const prompt = `你是一个算法竞赛出题人。请根据以下题目信息，完成三个任务：

## 题目信息
**标题**: ${problem.title}
**描述**: ${problem.description}
**输入格式**: ${problem.inputFormat}
**输出格式**: ${problem.outputFormat}
${sampleText ? `**样例**:\n${sampleText}` : ""}

## 任务

### 任务1：写一个暴力 C++ 解法（solution1）
- 用最简单、最直接、最不容易出错的暴力方法实现
- 不追求效率，只追求正确性
- 代码必须能编译运行，读 stdin 写 stdout

### 任务2：写一个不同思路的 C++ 解法（solution2）
- 用与 solution1 **完全不同的算法思路**实现
- 例如 solution1 用循环暴力，solution2 用数学公式；或者 solution1 用 DFS，solution2 用 BFS
- 同样必须正确，读 stdin 写 stdout
- 如果题目太简单只有一种做法，可以用不同的实现方式（比如不同的循环结构、数据结构）

### 任务3：生成 18 组测试输入
严格遵守题目的数据范围，生成以下类型的测试数据：
- 2-3 组最小边界（最小的 n、最小值等）
- 2-3 组最大边界（最大的 n、最大值等，但不要超过数据范围）
- 2-3 组特殊情况（全是同一个数、全是0、全是最大值等）
- 8-10 组随机中等规模数据
每组只需要输入数据，不需要输出。

## 输出格式
严格输出以下 JSON，不要输出其他任何内容：
\`\`\`json
{
  "solution1": "暴力C++代码",
  "solution2": "不同思路的C++代码",
  "inputs": [
    "第1组输入",
    "第2组输入",
    ...
  ]
}
\`\`\`

注意：
- 代码中的换行用 \\n 表示
- inputs 中每组输入是一个字符串，换行用 \\n 表示
- 不要在 JSON 之外输出任何文字`;

  const response = await client.messages.create({
    model: TESTGEN_MODEL,
    max_tokens: 12000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  // 提取 JSON
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"solution1"[\s\S]*"solution2"[\s\S]*"inputs"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Claude 响应无法解析:", text.slice(0, 500));
    throw new Error("AI 返回的格式无法解析");
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  const parsed = JSON.parse(jsonStr);

  if (!parsed.solution1 || !parsed.solution2 || !Array.isArray(parsed.inputs) || parsed.inputs.length === 0) {
    throw new Error("AI 返回数据不完整");
  }

  return { solution1: parsed.solution1, solution2: parsed.solution2, inputs: parsed.inputs };
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
        if (result.compile_output) console.error("编译错误:", result.compile_output.slice(0, 200));
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

/** 为一道题生成测试用例（主入口） */
export async function generateTestCases(problem: Problem): Promise<TestCase[]> {
  console.log(`[TestGen] 开始为 "${problem.title}" 生成测试数据...`);

  // 1. 调 Claude 生成两个解法和输入
  console.log("[TestGen] 调用 Claude API 生成双解法和测试输入...");
  const { solution1, solution2, inputs } = await callClaude(problem);
  console.log(`[TestGen] Claude 返回了 ${inputs.length} 组输入，解法1 ${solution1.length} 字符，解法2 ${solution2.length} 字符`);

  // 2. 用全部样例验证两个解法
  const samples: Array<{ input: string; output: string }> = JSON.parse(problem.samples || "[]");

  if (samples.length > 0) {
    console.log("[TestGen] 用全部样例验证解法1（暴力）...");
    const ok1 = await verifySolution("解法1", solution1, samples);
    if (!ok1) throw new Error("解法1（暴力）样例验证失败，请重试");

    console.log("[TestGen] 用全部样例验证解法2（不同思路）...");
    const ok2 = await verifySolution("解法2", solution2, samples);
    if (!ok2) throw new Error("解法2（不同思路）样例验证失败，请重试");

    console.log("[TestGen] 两个解法均通过全部样例验证");
  }

  // 3. 用两个解法分别运行所有测试输入
  console.log("[TestGen] 用解法1运行所有测试输入...");
  const results1 = await runSolution("解法1", solution1, inputs);

  console.log("[TestGen] 用解法2运行所有测试输入...");
  const results2 = await runSolution("解法2", solution2, inputs);

  // 4. 交叉验证：只保留两个解法输出一致的测试点
  const testCases: TestCase[] = [];
  let mismatch = 0;

  for (const input of inputs) {
    const trimmed = input.trim();
    const out1 = results1.get(trimmed);
    const out2 = results2.get(trimmed);

    if (out1 === undefined || out2 === undefined) {
      // 某个解法运行失败，跳过
      continue;
    }

    if (out1 === out2) {
      testCases.push({ input: trimmed, output: out1 });
    } else {
      mismatch++;
      console.warn(`[TestGen] 交叉验证不一致，已丢弃！输入: "${trimmed.slice(0, 50)}..." 解法1输出: "${out1.slice(0, 50)}" 解法2输出: "${out2.slice(0, 50)}"`);
    }
  }

  console.log(`[TestGen] 完成：${testCases.length} 个通过交叉验证，${mismatch} 个不一致已丢弃`);

  return testCases;
}
