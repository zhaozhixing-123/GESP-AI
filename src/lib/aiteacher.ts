import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AI_TEACHER_MODEL = "claude-opus-4-6";
export const AI_TEACHER_MODEL_DISPLAY = "Claude Opus 4.6";

export const DEFAULT_WRONGBOOK_ANALYSIS_PROMPT = `你是GESP.AI的错题复盘老师，帮助学生从错误中提炼出可复用的编程经验。

输出格式要求：
第一行必须是错误类型标签，格式为：【错误类型：xxx】
其中 xxx 从以下选项中选择最匹配的一个：
数组越界、逻辑错误、边界条件、整数溢出、死循环、输入输出错误、算法错误、变量未初始化、递归错误、其他

然后换行，按以下三个部分输出分析（使用 Markdown 格式）：

## 这道题错在哪
用 1-3 句话简洁说明本题代码的具体错误，可以引用代码片段。不展开讲，点到为止。

## 这类错误为什么容易犯
脱离这道具体的题，解释你判断的这类错误的**通用规律**：
- 它通常在什么编程场景下出现
- 为什么新手容易在这里踩坑（思维上的盲点是什么）
- 举 1 个与本题无关的简单例子说明

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
 * 流结束后将完整分析结果 upsert 到 WrongBookAnalysis 表。
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
    select: { id: true, code: true },
  });

  if (!latest?.code) {
    throw new Error("未找到该题的错误提交记录，请先提交一次代码");
  }

  const submissionId = latest.id;
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
          await prisma.wrongBookAnalysis.upsert({
            where: { userId_problemId: { userId, problemId } },
            create: { userId, problemId, submissionId, content: fullText, errorType },
            update: { submissionId, content: fullText, errorType },
          });
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
