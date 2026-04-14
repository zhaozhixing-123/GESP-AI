import { Resend } from "resend";

/** 懒初始化 Resend client，避免构建期缺少环境变量报错 */
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY 环境变量未配置");
    _resend = new Resend(key);
  }
  return _resend;
}

/** 生成 6 位数字验证码 */
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 发送验证码邮件 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  type: "register" | "reset_password"
): Promise<void> {
  const subject = type === "register"
    ? `GESP.AI 注册验证码：${code}`
    : `GESP.AI 密码重置验证码：${code}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1d5bd6; margin-bottom: 8px;">GESP.AI</h2>
      <p style="color: #444; font-size: 15px; line-height: 1.6;">
        ${type === "register" ? "你正在注册 GESP.AI 账号" : "你正在重置 GESP.AI 密码"}，验证码为：
      </p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0c1524;">${code}</span>
      </div>
      <p style="color: #777; font-size: 13px;">验证码 10 分钟内有效。如果不是你本人操作，请忽略此邮件。</p>
    </div>
  `;

  const fromEmail = process.env.RESEND_FROM_EMAIL || "GESP.AI <noreply@gesp.ai>";
  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: email,
    subject,
    html,
  });

  if (error) {
    console.error("[Email] 发送失败:", error);
    throw new Error("邮件发送失败，请稍后重试");
  }
}
