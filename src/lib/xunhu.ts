import crypto from "crypto";

const PLAN_NAMES: Record<string, string> = {
  monthly: "月卡会员",
  quarterly: "季卡会员",
  yearly: "年卡会员",
};

export const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 9900,    // 分
  quarterly: 19900,
  yearly: 59900,
};

export function getPlanName(plan: string): string {
  return PLAN_NAMES[plan] ?? plan;
}

/** 虎皮椒签名算法：过滤空值 → ASCII 排序 → key=value& → 末尾拼 secret → MD5 */
export function xunhuSign(
  params: Record<string, string>,
  appSecret: string
): string {
  const str = Object.keys(params)
    .filter((k) => params[k] !== "" && k !== "hash")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(str + appSecret).digest("hex");
}

/** 验证虎皮椒回调签名 */
export function verifyXunhuSign(
  params: Record<string, string>,
  appSecret: string
): boolean {
  const expected = xunhuSign(params, appSecret);
  return params.hash === expected;
}

function randomStr(len: number): string {
  return crypto.randomBytes(len).toString("hex").slice(0, len);
}

export interface XunhuCreateResult {
  qrcodeUrl: string;
  payUrl: string;
}

/**
 * 调用虎皮椒创建支付订单，返回二维码 URL。
 * 如果环境变量未配置，抛出配置错误。
 */
export async function createXunhuOrder({
  orderNo,
  amount,
  plan,
  notifyUrl,
  returnUrl,
}: {
  orderNo: string;
  amount: number; // 分
  plan: string;
  notifyUrl: string;
  returnUrl: string;
}): Promise<XunhuCreateResult> {
  const appid = process.env.XUNHU_APPID;
  const appSecret = process.env.XUNHU_APPSECRET;
  const apiUrl =
    process.env.XUNHU_API_URL ?? "https://api.xunhupay.com/payment/do.html";

  if (!appid || !appSecret) {
    throw new Error("支付功能尚未配置，请联系管理员");
  }

  const params: Record<string, string> = {
    version: "1.1",
    appid,
    trade_order_id: orderNo,
    total_fee: (amount / 100).toFixed(2),
    title: `GESP.AI ${getPlanName(plan)}`,
    time: Math.floor(Date.now() / 1000).toString(),
    notify_url: notifyUrl,
    return_url: returnUrl,
    nonce_str: randomStr(32),
  };

  params.hash = xunhuSign(params, appSecret);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const json = await res.json();
  if (json.errcode !== 0) {
    throw new Error(`虎皮椒错误：${json.errmsg ?? JSON.stringify(json)}`);
  }

  return {
    qrcodeUrl: json.url_qrcode,
    payUrl: json.url,
  };
}
