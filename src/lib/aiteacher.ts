import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AI_TEACHER_MODEL = "claude-opus-4-6";
export const AI_TEACHER_MODEL_DISPLAY = "Claude Opus 4.6";

export const DEFAULT_WRONGBOOK_ANALYSIS_PROMPT = `你是GESP.AI的错题分析助手，专门帮助学生找出代码中的具体错误。

任务：仔细分析学生提交的代码，找出导致答案错误的具体问题。

输出格式要求：
第一行必须是错误类型标签，格式为：【错误类型：xxx】
其中 xxx 从以下选项中选择最匹配的一个：
数组越界、逻辑错误、边界条件、整数溢出、死循环、输入输出错误、算法错误、变量未初始化、递归错误、其他

然后换行，进行详细分析。

分析规则：
1. 直接指出代码中的错误位置（引用具体代码片段）
2. 解释这样写为什么会出错，以及会导致什么错误结果
3. 给出修改思路和方向，但不直接给出完整修改后的代码
4. 如果有多处错误，按重要程度排序列出
5. 语言简洁，适合小学到初中学生理解

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
  problemId: number;
  userId: number;
  message: string;
  code?: string;
}

/** 构建完整的系统提示词 */
async function buildSystemPrompt(
  problemId: number,
  code?: string
): Promise<string> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { title: true, description: true, inputFormat: true, outputFormat: true },
  });

  if (!problem) throw new Error("题目不存在");

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

/** 构建错题分析的系统提示词（使用 wrongbook_analysis 分类提示词） */
async function buildWrongbookSystemPrompt(
  problemId: number,
  code: string
): Promise<string> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { title: true, description: true, inputFormat: true, outputFormat: true },
  });

  if (!problem) throw new Error("题目不存在");

  const template = await getWrongbookAnalysisPrompt();

  return substituteVariables(template, {
    problem_title: problem.title,
    problem_description: problem.description.slice(0, 2000),
    input_format: problem.inputFormat,
    output_format: problem.outputFormat,
    wrong_code_section: `学生提交的代码（存在错误）：\n\`\`\`cpp\n${code}\n\`\`\``,
  });
}

/** 加载聊天历史 */
async function loadChatHistory(
  userId: number,
  problemId: number
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const history = await prisma.chatHistory.findMany({
    where: { userId, problemId },
    orderBy: { createdAt: "asc" },
    take: 20, // 最近20条
  });

  return history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
}

/** 发送消息并获取流式响应 */
export async function chat(ctx: ChatContext): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = await buildSystemPrompt(ctx.problemId, ctx.code);
  const history = await loadChatHistory(ctx.userId, ctx.problemId);

  // 保存用户消息
  await prisma.chatHistory.create({
    data: {
      userId: ctx.userId,
      problemId: ctx.problemId,
      role: "user",
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
            userId: ctx.userId,
            problemId: ctx.problemId,
            role: "assistant",
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
 */
export async function streamWrongCodeAnalysis({
  userId,
  problemId,
}: {
  userId: number;
  problemId: number;
}): Promise<ReadableStream<Uint8Array>> {
  const latest = await prisma.submission.findFirst({
    where: { userId, problemId, status: { not: "AC" } },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  if (!latest?.code) {
    throw new Error("未找到该题的错误提交记录，请先提交一次代码");
  }

  const systemPrompt = await buildWrongbookSystemPrompt(problemId, latest.code);

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
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
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
