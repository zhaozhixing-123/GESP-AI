const API_URL = "https://judge0-ce.p.rapidapi.com";
const API_KEY = process.env.JUDGE0_API_KEY!;
const API_HOST = "judge0-ce.p.rapidapi.com";

// C++ (GCC 9.2.0)
const CPP_LANGUAGE_ID = 54;

const headers = {
  "Content-Type": "application/json",
  "X-RapidAPI-Key": API_KEY,
  "X-RapidAPI-Host": API_HOST,
};

interface Judge0Submission {
  token: string;
}

interface Judge0Result {
  token: string;
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
}

// Judge0 status IDs
// 1 = In Queue, 2 = Processing, 3 = Accepted, 4 = Wrong Answer
// 5 = Time Limit Exceeded, 6 = Compilation Error
// 7-12 = Various runtime errors, 13 = Internal Error, 14 = Exec Format Error

export async function submitToJudge0(
  sourceCode: string,
  stdin: string
): Promise<string> {
  const res = await fetch(`${API_URL}/submissions?base64_encoded=false&wait=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: CPP_LANGUAGE_ID,
      source_code: sourceCode,
      stdin,
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
    `${API_URL}/submissions/${token}?base64_encoded=false&fields=token,status,stdout,stderr,compile_output,time,memory`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Judge0 get result failed: ${res.status}`);
  }

  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 提交代码并等待结果 */
export async function judgeCode(
  sourceCode: string,
  stdin: string
): Promise<Judge0Result> {
  const token = await submitToJudge0(sourceCode, stdin);

  // 轮询等待结果，最多 30 秒
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const result = await getJudge0Result(token);
    // status.id 1=In Queue, 2=Processing
    if (result.status.id > 2) {
      return result;
    }
  }

  throw new Error("判题超时，请稍后重试");
}

/** 将 Judge0 status 映射到我们的状态码 */
export function mapStatus(statusId: number): string {
  switch (statusId) {
    case 3: return "AC";
    case 4: return "WA";
    case 5: return "TLE";
    case 6: return "CE";
    case 7: case 8: case 9: case 10: case 11: case 12: return "RE";
    case 13: case 14: return "RE";
    default: return "WA";
  }
}
