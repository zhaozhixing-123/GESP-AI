const API_URL = "https://judge0-ce.p.rapidapi.com";
const API_KEY = process.env.JUDGE0_API_KEY!;
const API_HOST = "judge0-ce.p.rapidapi.com";

// C++ (GCC 9.2.0)
const CPP_LANGUAGE_ID = 54;

// 资源限制
const CPU_TIME_LIMIT = 2;       // 秒
const MEMORY_LIMIT = 262144;    // KB (256MB)

const headers = {
  "Content-Type": "application/json",
  "X-RapidAPI-Key": API_KEY,
  "X-RapidAPI-Host": API_HOST,
};

interface Judge0Submission {
  token: string;
}

export interface Judge0Result {
  token: string;
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
}

// Judge0 status IDs
// 1 = In Queue, 2 = Processing, 3 = Accepted, 4 = Wrong Answer
// 5 = Time Limit Exceeded, 6 = Compilation Error
// 7-12 = Various runtime errors, 13 = Internal Error, 14 = Exec Format Error
// 注意: Judge0 没有独立的 MLE 状态，内存超限会报告为 RE

function toBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

function fromBase64(str: string | null): string | null {
  if (!str) return null;
  try {
    return Buffer.from(str, "base64").toString("utf-8");
  } catch {
    return str;
  }
}

export async function submitToJudge0(
  sourceCode: string,
  stdin: string
): Promise<string> {
  const res = await fetch(`${API_URL}/submissions?base64_encoded=true&wait=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: CPP_LANGUAGE_ID,
      source_code: toBase64(sourceCode),
      stdin: toBase64(stdin),
      cpu_time_limit: CPU_TIME_LIMIT,
      memory_limit: MEMORY_LIMIT,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 submit failed: ${res.status} ${text}`);
  }

  const data: Judge0Submission = await res.json();
  return data.token;
}

export async function getJudge0Result(token: string): Promise<Judge0Result> {
  const res = await fetch(
    `${API_URL}/submissions/${token}?base64_encoded=true&fields=token,status,stdout,stderr,compile_output,message,time,memory`,
    { headers }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Judge0] GET /submissions/${token} failed: ${res.status} ${text}`);
    throw new Error(`Judge0 get result failed: ${res.status} ${text}`);
  }

  const raw = await res.json();
  return {
    ...raw,
    stdout: fromBase64(raw.stdout),
    stderr: fromBase64(raw.stderr),
    compile_output: fromBase64(raw.compile_output),
    message: fromBase64(raw.message),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 批量提交多个测试点，返回 token 列表 */
export async function submitBatch(
  sourceCode: string,
  inputs: string[]
): Promise<string[]> {
  const res = await fetch(`${API_URL}/submissions/batch?base64_encoded=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      submissions: inputs.map((stdin) => ({
        language_id: CPP_LANGUAGE_ID,
        source_code: toBase64(sourceCode),
        stdin: toBase64(stdin),
        cpu_time_limit: CPU_TIME_LIMIT,
        memory_limit: MEMORY_LIMIT,
      })),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 batch submit failed: ${res.status} ${text}`);
  }

  const data: { token: string }[] = await res.json();
  return data.map((d) => d.token);
}

/** 批量查询多个 token 的结果 */
export async function getBatchResults(tokens: string[]): Promise<Judge0Result[]> {
  const res = await fetch(
    `${API_URL}/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,message,time,memory`,
    { headers }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 batch get failed: ${res.status} ${text}`);
  }

  const data: { submissions: any[] } = await res.json();
  return data.submissions.map((raw) => ({
    ...raw,
    stdout: fromBase64(raw.stdout),
    stderr: fromBase64(raw.stderr),
    compile_output: fromBase64(raw.compile_output),
    message: fromBase64(raw.message),
  }));
}

/**
 * 批量判题：一次提交所有测试点，并行等待所有结果。
 * 比逐个串行调用快 N 倍。
 */
export async function judgeAll(
  sourceCode: string,
  inputs: string[]
): Promise<Judge0Result[]> {
  if (inputs.length === 0) return [];

  const tokens = await submitBatch(sourceCode, inputs);

  // 首次 500ms 后查，后续每 1000ms 查一次，最多等 30 秒
  const delays = [500, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
                  1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
                  1000, 1000, 1000, 1000, 1000];
  for (const delay of delays) {
    await sleep(delay);
    const results = await getBatchResults(tokens);
    if (results.every((r) => r.status.id > 2)) {
      return results;
    }
  }

  throw new Error("判题超时，请稍后重试");
}

/** 提交代码并等待结果（单测试点，保留供自定义输入使用） */
export async function judgeCode(
  sourceCode: string,
  stdin: string
): Promise<Judge0Result> {
  const [result] = await judgeAll(sourceCode, [stdin]);
  return result;
}

/** 将 Judge0 result 映射到我们的状态码 */
export function mapStatus(result: Judge0Result): string {
  const id = result.status.id;
  const msg = (result.message || "").toLowerCase();

  switch (id) {
    case 3: return "AC";  // 程序正常运行（还需要对比输出）
    case 4: return "WA";
    case 5: return "TLE";
    case 6: return "CE";
    case 7: case 8: case 9: case 10: case 11: case 12: {
      // Judge0 RE 中，如果 message 包含 memory 相关信息，判定为 MLE
      if (msg.includes("memory") || msg.includes("mle") ||
          (result.memory && result.memory >= MEMORY_LIMIT)) {
        return "MLE";
      }
      return "RE";
    }
    case 13: case 14: return "RE";
    default: return "WA";
  }
}

/** 从 Judge0 result 提取错误信息 */
export function getErrorMessage(result: Judge0Result): string {
  if (result.compile_output) return result.compile_output;
  if (result.stderr) return result.stderr;
  if (result.message) return result.message;
  return "";
}
