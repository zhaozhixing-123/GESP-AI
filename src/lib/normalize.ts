/** 标准化输出：去掉每行尾部空格 + 整体尾部空行 */
export function normalizeOutput(s: string): string {
  return s
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/, "");
}
