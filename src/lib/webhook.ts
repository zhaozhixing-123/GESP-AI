/**
 * Webhook URL 安全校验 —— 防止 SSRF 攻击
 * 只允许已知安全的外部域名，禁止内网地址
 */

const ALLOWED_WEBHOOK_HOSTS = [
  "open.feishu.cn",
  "open.larksuite.com",
  "oapi.dingtalk.com",
];

export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_WEBHOOK_HOSTS.some(
      (host) => u.hostname === host || u.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function isDingtalk(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("dingtalk.com");
  } catch {
    return false;
  }
}

/**
 * 构造 Webhook 消息体，自动适配飞书/钉钉格式
 */
export function buildWebhookBody(url: string, text: string): string {
  if (isDingtalk(url)) {
    return JSON.stringify({
      msgtype: "text",
      text: { content: text },
    });
  }
  // 飞书 / Lark
  return JSON.stringify({
    msg_type: "text",
    content: { text },
  });
}
