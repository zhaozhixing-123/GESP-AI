import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AI_TEACHER_MODEL = "claude-opus-4-6";
export const AI_TEACHER_MODEL_DISPLAY = "Claude Opus 4.6";

export const DEFAULT_WRONGBOOK_ANALYSIS_PROMPT = `你是GESP.AI的错题复盘老师，帮助学生从错误中提炼出可复用的编程经验。

本次提交结果：{{submission_status_label}}
{{status_specific_hint}}

输出格式要求（严格遵守）：
第一行必须是错误类型标签，格式为：【错误类型：xxx】
其中 xxx 从以下选项中选择最匹配的一个：
数组越界、逻辑错误、边界条件、整数溢出、死循环、输入输出错误、算法错误、变量未初始化、递归错误、语法错误、超时优化、内存超限、其他

然后换行，按以下三个部分输出分析（使用 Markdown 格式）：

## 这道题错在哪
用 1-3 句话简洁说明本题代码的具体错误，可以引用代码片段（用反引号）。不展开讲，点到为止。

## 这类错误为什么容易犯
脱离这道具体的题，解释你判断的这类错误的**通用规律**：
- 它通常在什么编程场景下出现
- 为什么新手容易在这里踩坑（思维上的盲点是什么）
- 举 1 个与本题完全无关的简单代码示例来说明这类错误

## 下次怎么避免
给出 2-4 条具体的**自检习惯**，像检查清单一样，适用于所有同类题目。
用「✓ 写完XX类代码后，检查……」的格式，让学生养成固定的思维动作。

写作要求：
- 语言简洁，适合小学到初中学生理解
- 重点在第二、三部分，帮助学生举一反三
- 不要给出本题的完整修改代码

当前题目信息：
- 标题：{{problem_title}}
- 描述：{{problem_description}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}

{{wrong_code_section}}`;

const DEFAULT_SYSTEM_PROMPT = `你是GESP.AI的AI编程老师，帮助学生学习C++和GESP考试。

核心规则：
1. 绝对不能给出完整的解题代码
2. 绝对不能直接说出最终答案
3. 用引导式提问帮助学生自己想出解法
4. 可以解释概念、给思路方向、指出代码错误
5. 语言简洁，适合小学到初中学生理解
6. 如果学生直接要答案，温和地拒绝并引导他思考

当前题目信息：
- 标题：{{problem_title}}
- 描述：{{problem_description}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}

{{user_code_section}}`;

/** 从数据库加载 System Prompt，没有则用默认值 */
async function getSystemPrompt(): Promise<string> {
  try {
    const prompt = await prisma.prompt.findFirst({
      where: { category: "system" },
      orderBy: { updatedAt: "desc" },
    });
    if (prompt?.content) return prompt.content;
  } catch (e) {
    console.error("[AITeacher] 加载提示词失败:", e);
  }
  return DEFAULT_SYSTEM_PROMPT;
}

/** 从数据库加载错题分析 System Prompt，没有则用默认值 */
async function getWrongbookAnalysisPrompt(): Promise<string> {
  try {
    const prompt = await prisma.prompt.findFirst({
      where: { category: "wrongbook_analysis" },
      orderBy: { updatedAt: "desc" },
    });
    if (prompt?.content) return prompt.content;
  } catch (e) {
    console.error("[AITeacher] 加载错题分析提示词失败:", e);
  }
  return DEFAULT_WRONGBOOK_ANALYSIS_PROMPT;
}

/** 替换提示词中的变量 */
function substituteVariables(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

interface ChatContext {
  problemId?: number;
  variantId?: number;
  userId: number;
  message: string;
  code?: string;
}

/** 从 Problem 或 VariantProblem 表获取题目基础信息 */
async function getProblemInfo(
  problemId?: number,
  variantId?: number
): Promise<{ title: string; description: string; inputFormat: string; outputFormat: string }> {
  if (variantId) {
    const v = await prisma.variantProblem.findUnique({
      where: { id: variantId },
      select: { title: true, description: true, inputFormat: true, outputFormat: true },
    });
    if (!v) throw new Error("变形题不存在");
    return v;
  }
  if (problemId) {
    const p = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { title: true, description: true, inputFormat: true, outputFormat: true },
    });
    if (!p) throw new Error("题目不存在");
    return p;
  }
  throw new Error("必须提供 problemId 或 variantId");
}

/** 构建完整的系统提示词 */
async function buildSystemPrompt(
  problemId?: number,
  variantId?: number,
  code?: string
): Promise<string> {
  const problem = await getProblemInfo(problemId, variantId);
  const template = await getSystemPrompt();

  const codeSection = code
    ? `学生当前的代码：\n\`\`\`cpp\n${code}\n\`\`\``
    : "学生尚未提供代码。";

  return substituteVariables(template, {
    problem_title: problem.title,
    problem_description: problem.description.slice(0, 2000),
    input_format: problem.inputFormat,
    output_format: problem.outputFormat,
    user_code_section: codeSection,
  });
}

const STATUS_LABELS: Record<string, string> = {
  WA: "答案错误（Wrong Answer）",
  TLE: "运行超时（Time Limit Exceeded）",
  RE: "运行错误（Runtime Error）",
  CE: "编译错误（Compile Error）",
  MLE: "内存超限（Memory Limit Exceeded）",
};

const STATUS_HINTS: Record<string, string> = {
  WA: "分析重点：程序能运行但结果不对，请重点排查逻辑错误、边界条件（如 n=0、n=1、最大值）、以及特殊情况的处理。",
  TLE: "分析重点：程序运行超时，请重点分析算法的时间复杂度，检查是否存在多余的嵌套循环，或者是否需要换用更高效的算法（如用哈希表代替线性查找）。",
  RE: "分析重点：程序运行崩溃，请重点检查数组下标是否越界、是否有除以零的情况、递归是否会栈溢出，以及变量是否已初始化。",
  CE: "分析重点：编译失败说明有语法错误，请重点检查括号/大括号是否匹配、每条语句末尾是否有分号、变量声明和数据类型是否正确。",
  MLE: "分析重点：内存超限，请重点检查是否声明了过大的数组、是否有无限递归导致栈溢出，以及是否有不必要的大型数据结构。",
};

/** 构建错题分析的系统提示词（使用 wrongbook_analysis 分类提示词） */
async function buildWrongbookSystemPrompt(
  code: string,
  errorStatus: string,
  problemId?: number,
  variantId?: number
): Promise<string> {
  const problem = await getProblemInfo(problemId, variantId);

  const template = await getWrongbookAnalysisPrompt();

  return substituteVariables(template, {
    problem_title:          problem.title,
    problem_description:    problem.description.slice(0, 2000),
    input_format:           problem.inputFormat,
    output_format:          problem.outputFormat,
    submission_status_label: STATUS_LABELS[errorStatus] || "未知状态",
    status_specific_hint:   STATUS_HINTS[errorStatus] || "",
    wrong_code_section:     `学生提交的代码（存在错误）：\n\`\`\`cpp\n${code}\n\`\`\``,
  });
}

/** 加载聊天历史 */
async function loadChatHistory(
  userId: number,
  problemId?: number,
  variantId?: number
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const where = variantId
    ? { userId, variantId }
    : { userId, problemId: problemId! };

  const history = await prisma.chatHistory.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  return history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
}

/** 发送消息并获取流式响应 */
export async function chat(ctx: ChatContext): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = await buildSystemPrompt(ctx.problemId, ctx.variantId, ctx.code);
  const history = await loadChatHistory(ctx.userId, ctx.problemId, ctx.variantId);

  // 保存用户消息
  await prisma.chatHistory.create({
    data: {
      userId:    ctx.userId,
      problemId: ctx.variantId ? null : ctx.problemId,
      variantId: ctx.variantId ?? null,
      role:    "user",
      content: ctx.message,
    },
  });

  // 构建消息列表
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: ctx.message },
  ];

  // 调用 Claude API（流式）
  console.log(`[AITeacher] 调用模型: ${AI_TEACHER_MODEL}`);
  const stream = await client.messages.stream({
    model: AI_TEACHER_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  // 创建 ReadableStream 返回给客户端
  let fullResponse = "";
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }

        // 流结束，保存助手回复
        await prisma.chatHistory.create({
          data: {
            userId:    ctx.userId,
            problemId: ctx.variantId ? null : ctx.problemId,
            variantId: ctx.variantId ?? null,
            role:    "assistant",
            content: fullResponse,
          },
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model: AI_TEACHER_MODEL_DISPLAY })}\n\n`));
        controller.close();
      } catch (e: any) {
        console.error("[AITeacher] Stream error:", e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
        controller.close();
      }
    },
  });

  return readable;
}

/**
 * 错题分析（一次性）：自动拉取用户最近一次非 AC 提交代码，
 * 用 wrongbook_analysis 提示词进行专项分析，不读写 ChatHistory。
 * 流结束后将完整分析结果 upsert 到 WrongBookAnalysis 表。
 */
export async function streamWrongCodeAnalysis({
  userId,
  problemId,
  variantId,
}: {
  userId: number;
  problemId?: number;
  variantId?: number;
}): Promise<ReadableStream<Uint8Array>> {
  let submissionId: number | null = null;
  let variantSubmissionId: number | null = null;
  let code: string;
  let status: string;

  if (variantId) {
    const latest = await prisma.variantSubmission.findFirst({
      where: { userId, variantId, status: { not: "AC" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, status: true },
    });
    if (!latest?.code) throw new Error("未找到该变形题的错误提交记录，请先提交一次代码");
    variantSubmissionId = latest.id;
    code   = latest.code;
    status = latest.status;
  } else {
    const latest = await prisma.submission.findFirst({
      where: { userId, problemId: problemId!, status: { not: "AC" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, status: true },
    });
    if (!latest?.code) throw new Error("未找到该题的错误提交记录，请先提交一次代码");
    submissionId = latest.id;
    code   = latest.code;
    status = latest.status;
  }

  const systemPrompt = await buildWrongbookSystemPrompt(code, status, problemId, variantId);

  console.log(`[WrongbookAnalysis] 调用模型: ${AI_TEACHER_MODEL}`);
  const stream = await client.messages.stream({
    model: AI_TEACHER_MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: "请分析我的代码哪里出错了。" }],
  });

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }

        // 提取错误类型并持久化到数据库
        const match = fullText.match(/【错误类型：(.+?)】/);
        const errorType = match ? match[1].trim() : "其他";
        try {
          if (variantId) {
            await prisma.wrongBookAnalysis.upsert({
              where: { userId_variantId: { userId, variantId } },
              create: { userId, variantId, variantSubmissionId, content: fullText, errorType },
              update: { variantSubmissionId, content: fullText, errorType },
            });
          } else {
            await prisma.wrongBookAnalysis.upsert({
              where: { userId_problemId: { userId, problemId: problemId! } },
              create: { userId, problemId: problemId!, submissionId, content: fullText, errorType },
              update: { submissionId, content: fullText, errorType },
            });
          }
        } catch (dbErr) {
          console.error("[WrongbookAnalysis] 保存分析失败:", dbErr);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model: AI_TEACHER_MODEL_DISPLAY })}\n\n`));
        controller.close();
      } catch (e: any) {
        console.error("[WrongbookAnalysis] Stream error:", e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
        controller.close();
      }
    },
  });
}

export interface ExamProblemEntry {
  title: string;
  description: string;
  code: string;
  samplesPassed: number;
  samplesTotal: number;
}

/**
 * 模拟考试诊断报告（流式）
 * 接收学生的作答情况，生成 AI 诊断报告
 */
export async function streamExamReview(
  problems: ExamProblemEntry[],
  timeUsedMinutes: number
): Promise<ReadableStream<Uint8Array>> {
  const problemSections = problems
    .map((p, i) => {
      const codeBlock = p.code?.trim()
        ? `\`\`\`cpp\n${p.code}\n\`\`\``
        : "（未作答）";
      const sampleInfo = p.code?.trim()
        ? `样例通过：${p.samplesPassed}/${p.samplesTotal}`
        : "未作答";
      return `### 第 ${i + 1} 题：${p.title}\n\n题目描述（摘要）：${p.description.slice(0, 400)}\n\n学生代码：\n${codeBlock}\n\n${sampleInfo}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `你是 GESP.AI 的模拟考试诊断老师。学生刚完成了一次模拟考试，请根据题目和学生提交的代码给出专业、鼓励性的诊断报告。

报告结构（使用 Markdown 格式）：

## 整体表现
简要评价学生的整体发挥：完成几道题、时间使用情况、整体代码质量印象（2-3句）。

## 逐题点评
对每道题分别点评：
- 代码思路是否正确
- 主要问题（如有，具体指出）
- 一条改进建议

## 知识盲区诊断
从所有错误中归纳出 2-3 个需要重点加强的知识点，说明为什么。

## 下一步学习计划
给出 3 条具体可行的建议，帮助学生有针对性地提升。

写作要求：
- 鼓励为主，先肯定优点再指出问题
- 语言适合小学到初中学生
- 不要给出完整的修改代码`;

  const userMessage = `考试用时：约 ${timeUsedMinutes} 分钟\n\n${problemSections}\n\n请生成诊断报告。`;

  console.log(`[ExamReview] 调用模型: ${AI_TEACHER_MODEL}`);
  const stream = await client.messages.stream({
    model: AI_TEACHER_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model: AI_TEACHER_MODEL_DISPLAY })}\n\n`));
        controller.close();
      } catch (e: any) {
        console.error("[ExamReview] Stream error:", e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
        controller.close();
      }
    },
  });
}
