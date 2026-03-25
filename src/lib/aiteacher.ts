import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AI_TEACHER_MODEL = "claude-opus-4-20250514";
export const AI_TEACHER_MODEL_DISPLAY = "Claude Opus 4.6";

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
