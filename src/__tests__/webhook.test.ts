import { describe, it, expect } from "vitest";
import { isValidWebhookUrl, isDingtalk, buildWebhookBody } from "@/lib/webhook";

describe("isValidWebhookUrl", () => {
  // ---- 合法 URL ----

  it("accepts standard feishu webhook URL", () => {
    expect(
      isValidWebhookUrl("https://open.feishu.cn/open-apis/bot/v2/hook/abc123"),
    ).toBe(true);
  });

  it("accepts larksuite webhook URL", () => {
    expect(
      isValidWebhookUrl("https://open.larksuite.com/open-apis/bot/v2/hook/xyz"),
    ).toBe(true);
  });

  it("accepts feishu subdomain", () => {
    expect(
      isValidWebhookUrl("https://some.open.feishu.cn/path"),
    ).toBe(true);
  });

  it("accepts dingtalk webhook URL", () => {
    expect(
      isValidWebhookUrl("https://oapi.dingtalk.com/robot/send?access_token=abc123"),
    ).toBe(true);
  });

  // ---- 不合法 URL ----

  it("rejects http (not https)", () => {
    expect(
      isValidWebhookUrl("http://open.feishu.cn/open-apis/bot/v2/hook/abc"),
    ).toBe(false);
  });

  it("rejects http dingtalk", () => {
    expect(
      isValidWebhookUrl("http://oapi.dingtalk.com/robot/send?access_token=abc"),
    ).toBe(false);
  });

  it("rejects non-feishu domain", () => {
    expect(
      isValidWebhookUrl("https://hooks.slack.com/services/xxx"),
    ).toBe(false);
  });

  it("rejects localhost", () => {
    expect(isValidWebhookUrl("https://localhost/webhook")).toBe(false);
  });

  it("rejects internal IP", () => {
    expect(isValidWebhookUrl("https://192.168.1.1/hook")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidWebhookUrl("")).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(isValidWebhookUrl("not-a-url")).toBe(false);
  });

  it("rejects domain that merely contains feishu.cn", () => {
    expect(
      isValidWebhookUrl("https://evil-feishu.cn/hook"),
    ).toBe(false);
  });

  it("rejects domain that merely contains dingtalk.com", () => {
    expect(
      isValidWebhookUrl("https://evil-dingtalk.com/hook"),
    ).toBe(false);
  });

  it("rejects feishu.cn without open subdomain", () => {
    expect(
      isValidWebhookUrl("https://feishu.cn/hook"),
    ).toBe(false);
  });

  it("rejects ftp protocol", () => {
    expect(
      isValidWebhookUrl("ftp://open.feishu.cn/hook"),
    ).toBe(false);
  });
});

describe("isDingtalk", () => {
  it("returns true for dingtalk URL", () => {
    expect(isDingtalk("https://oapi.dingtalk.com/robot/send?access_token=abc")).toBe(true);
  });

  it("returns false for feishu URL", () => {
    expect(isDingtalk("https://open.feishu.cn/open-apis/bot/v2/hook/abc")).toBe(false);
  });

  it("returns false for invalid URL", () => {
    expect(isDingtalk("not-a-url")).toBe(false);
  });
});

describe("buildWebhookBody", () => {
  const text = "[GESP.AI] 测试消息";

  it("builds feishu format for feishu URL", () => {
    const body = JSON.parse(
      buildWebhookBody("https://open.feishu.cn/open-apis/bot/v2/hook/abc", text),
    );
    expect(body.msg_type).toBe("text");
    expect(body.content.text).toBe(text);
    expect(body.msgtype).toBeUndefined();
  });

  it("builds dingtalk format for dingtalk URL", () => {
    const body = JSON.parse(
      buildWebhookBody("https://oapi.dingtalk.com/robot/send?access_token=abc", text),
    );
    expect(body.msgtype).toBe("text");
    expect(body.text.content).toBe(text);
    expect(body.msg_type).toBeUndefined();
  });
});
