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

/** 调用 Claude 生成解法和测试输入 */
async function callClaude(problem: Problem): Promise<{ solution: string; inputs: string[] }> {
  const samples = JSON.parse(problem.samples || "[]");
  const sampleText = samples
    .map((s: any, i: number) => `样例${i + 1}:\n输入:\n${s.input}\n输出:\n${s.output}`)
    .join("\n\n");

  const prompt = `你是一个算法竞赛出题人。请根据以下题目信息，完成两个任务：

## 题目信息
**标题**: ${problem.title}
**描述**: ${problem.description}
**输入格式**: ${problem.inputFormat}
**输出格式**: ${problem.outputFormat}
${sampleText ? `**样例**:\n${sampleText}` : ""}

## 任务

### 任务1：写一个正确的 C++ 解法
- 用最直接、最不容易出错的方式实现（暴力解法优先）
- 代码必须能编译运行，读 stdin 写 stdout
- 不要用任何花哨的优化，确保正确性

### 任务2：生成 18 组测试输入
严格遵守题目的数据范围，生成以下类型的测试数据：
- 2-3 组最小边界（最小的 n、最小值等）
- 2-3 组最大边界（最大的 n、最大值等，但不要超过数据范围）
- 2-3 组特殊情况（全是同一个数、全是0、全是最大值等）
- 8-10 组随机中等规模数据
每组只需要输入数据，不需要输出（我会用你的解法运行得到输出）。

## 输出格式
严格输出以下 JSON，不要输出其他任何内容：
\`\`\`json
{
  "solution": "完整C++代码",
  "inputs": [
    "第1组输入",
    "第2组输入",
    ...
  ]
}
\`\`\`

注意：
- solution 中的换行用 \\n 表示
- inputs 中每组输入是一个字符串，换行用 \\n 表示
- 不要在 JSON 之外输出任何文字`;

  const response = await client.messages.create({
    model: TESTGEN_MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  // 提取 JSON
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"solution"[\s\S]*"inputs"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Claude 响应无法解析:", text.slice(0, 500));
    throw new Error("AI 返回的格式无法解析");
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  const parsed = JSON.parse(jsonStr);

  if (!parsed.solution || !Array.isArray(parsed.inputs) || parsed.inputs.length === 0) {
    throw new Error("AI 返回数据不完整");
  }

  return { solution: parsed.solution, inputs: parsed.inputs };
}

/** 用 Judge0 运行解法获取输出 */
async function runSolution(solution: string, inputs: string[]): Promise<TestCase[]> {
  const testCases: TestCase[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i].trim();
    console.log(`[TestGen] 运行测试点 ${i + 1}/${inputs.length}...`);

    try {
      const result = await judgeCode(solution, input);

      if (result.status.id !== 3 && result.status.id !== 4) {
        // 程序运行出错，跳过这个测试点
        console.error(`[TestGen] 测试点 ${i + 1} 运行失败: ${result.status.description}`);
        if (result.compile_output) console.error("编译错误:", result.compile_output.slice(0, 200));
        if (result.stderr) console.error("运行错误:", result.stderr.slice(0, 200));
        continue;
      }

      const output = (result.stdout || "").replace(/\s+$/, "");
      if (output) {
        testCases.push({ input, output });
      }
    } catch (e: any) {
      console.error(`[TestGen] 测试点 ${i + 1} 异常: ${e.message}`);
    }

    // Judge0 间隔
    if (i < inputs.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return testCases;
}

/** 为一道题生成测试用例（主入口） */
export async function generateTestCases(problem: Problem): Promise<TestCase[]> {
  console.log(`[TestGen] 开始为 "${problem.title}" 生成测试数据...`);

  // 1. 调 Claude 生成解法和输入
  console.log("[TestGen] 调用 Claude API 生成解法和测试输入...");
  const { solution, inputs } = await callClaude(problem);
  console.log(`[TestGen] Claude 返回了 ${inputs.length} 组输入，解法 ${solution.length} 字符`);

  // 2. 先验证解法能跑通样例
  const samples: Array<{ input: string; output: string }> = JSON.parse(problem.samples || "[]");
  if (samples.length > 0) {
    console.log("[TestGen] 验证解法是否正确（用样例检验）...");
    const sampleResult = await judgeCode(solution, samples[0].input);
    const sampleOutput = (sampleResult.stdout || "").replace(/\s+$/, "");
    const expectedOutput = samples[0].output.replace(/\s+$/, "");

    if (sampleOutput !== expectedOutput) {
      console.error(`[TestGen] 解法验证失败！期望 "${expectedOutput}"，实际 "${sampleOutput}"`);
      throw new Error(`AI 生成的解法不正确（样例验证失败），请重试`);
    }
    console.log("[TestGen] 解法验证通过");
  }

  // 3. 用 Judge0 运行所有测试输入
  console.log("[TestGen] 用 Judge0 运行测试输入...");
  const testCases = await runSolution(solution, inputs);
  console.log(`[TestGen] 完成，共生成 ${testCases.length} 个有效测试点`);

  return testCases;
}
