import { prisma } from "./prisma";

/**
 * 大模型成本埋点。统一在每次 Claude API 调用后记录 tokens、用途、费用。
 *
 * 费用按 Anthropic 官方价格估算（USD）：
 *   https://platform.claude.com/docs/en/about-claude/pricing
 *
 * 已知模型定价（per MTok）：
 *   Opus 4.7 / 4.6 / 4.5 : input $5   output $25   cache_read $0.5   cache_5m $6.25  cache_1h $10
 *   Sonnet 4.6 / 4.5 / 4 : input $3   output $15   cache_read $0.3   cache_5m $3.75  cache_1h $6
 *   Haiku  4.5          : input $1   output $5    cache_read $0.1   cache_5m $1.25  cache_1h $2
 *
 * 未识别的模型按 Opus 4.7 上限估算（保守）。
 */

export type LlmPurpose =
  | "chat"
  | "wrongbook_analysis"
  | "exam_review"
  | "testgen"
  | "testverify"
  | "variantgen"
  | "variantverify"
  | "problem_autotag";

export const PURPOSE_LABEL: Record<LlmPurpose, string> = {
  chat: "聊天",
  wrongbook_analysis: "错题分析",
  exam_review: "模拟考试诊断",
  testgen: "测试用例生成",
  testverify: "测试用例复核",
  variantgen: "变形题生成",
  variantverify: "变形题复核",
  problem_autotag: "自动打标",
};

interface ModelPrice {
  input: number;       // $/MTok
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

const PRICE_TABLE: Record<string, ModelPrice> = {
  // Opus 家族
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  "claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  // Sonnet 家族
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  // Haiku
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
};

const FALLBACK_PRICE: ModelPrice = PRICE_TABLE["claude-opus-4-7"];

function priceFor(model: string): ModelPrice {
  if (PRICE_TABLE[model]) return PRICE_TABLE[model];
  // 模糊匹配：model 名以 claude-opus/sonnet/haiku-<ver> 开头
  for (const key of Object.keys(PRICE_TABLE)) {
    if (model.startsWith(key)) return PRICE_TABLE[key];
  }
  return FALLBACK_PRICE;
}

interface AnthropicUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

export function computeCostUsd(model: string, usage: AnthropicUsage): number {
  const p = priceFor(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cw5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const cw1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // 若 cache_creation 细分字段不可用，将 cache_creation_input_tokens 全部当作 5m 写入
  const fallbackCw5m =
    cw5m === 0 && cw1h === 0 ? (usage.cache_creation_input_tokens ?? 0) : 0;

  const cost =
    (input * p.input +
      output * p.output +
      cacheRead * p.cacheRead +
      (cw5m + fallbackCw5m) * p.cacheWrite5m +
      cw1h * p.cacheWrite1h) /
    1_000_000;
  return cost;
}

/** 成功调用：从 Anthropic 响应提取 usage 并落库 */
export async function logLlmSuccess(params: {
  purpose: LlmPurpose;
  model: string;
  usage: AnthropicUsage;
  startedAt: number;
}): Promise<void> {
  try {
    const { purpose, model, usage, startedAt } = params;
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cw5m =
      usage.cache_creation?.ephemeral_5m_input_tokens ??
      usage.cache_creation_input_tokens ??
      0;
    const cw1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    await prisma.llmCall.create({
      data: {
        purpose,
        model,
        status: "success",
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWrite5mTokens:
          usage.cache_creation?.ephemeral_5m_input_tokens !== undefined ? cw5m : (usage.cache_creation_input_tokens ?? 0),
        cacheWrite1hTokens: cw1h,
        costUsd: computeCostUsd(model, usage),
        latencyMs: Math.max(0, Date.now() - startedAt),
      },
    });
  } catch (e) {
    // 埋点失败不影响业务
    console.error("[llmCost] logLlmSuccess failed", e);
  }
}

/** 失败调用：记录异常,tokens 置零 */
export async function logLlmError(params: {
  purpose: LlmPurpose;
  model: string;
  error: unknown;
  startedAt: number;
}): Promise<void> {
  try {
    const { purpose, model, error, startedAt } = params;
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.llmCall.create({
      data: {
        purpose,
        model,
        status: "error",
        errorMsg: msg.slice(0, 500),
        latencyMs: Math.max(0, Date.now() - startedAt),
      },
    });
  } catch (e) {
    console.error("[llmCost] logLlmError failed", e);
  }
}
