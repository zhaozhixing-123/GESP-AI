/**
 * Webhook URL 安全校验 —— 防止 SSRF 攻击
 * 只允许已知安全的外部域名，禁止内网地址
 */

const ALLOWED_WEBHOOK_HOSTS = [
  "open.feishu.cn",
  "open.larksuite.com",
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
