import { describe, it, expect } from "vitest";
import { isValidWebhookUrl } from "@/lib/webhook";

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

  // ---- 不合法 URL ----

  it("rejects http (not https)", () => {
    expect(
      isValidWebhookUrl("http://open.feishu.cn/open-apis/bot/v2/hook/abc"),
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
    // evil-feishu.cn should NOT match
    expect(
      isValidWebhookUrl("https://evil-feishu.cn/hook"),
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
