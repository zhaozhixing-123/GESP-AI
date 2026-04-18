import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getTokenFromRequest: vi.fn(),
  verifyToken: vi.fn(),
  getUserFromRequest: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getTokenFromRequest, verifyToken, getUserFromRequest } from "@/lib/auth";

// ---- focus/notify tests ----

describe("POST /api/focus/notify", () => {
  let handler: typeof import("@/app/api/focus/notify/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Re-mock after resetModules
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        user: { findUnique: vi.fn() },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getTokenFromRequest: vi.fn(),
      verifyToken: vi.fn(),
      getUserFromRequest: vi.fn(),
    }));

    const mod = await import("@/app/api/focus/notify/route");
    handler = mod.POST;
  });

  function makeRequest(body: object, token = "valid-token") {
    return new Request("http://localhost/api/focus/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }) as any;
  }

  it("returns 401 when not logged in", async () => {
    const { getTokenFromRequest } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue(null);

    const res = await handler(makeRequest({ focusMinutes: 10, distractMinutes: 2 }));
    expect(res.status).toBe(401);
  });

  it("returns sent:false when user has no webhook configured", async () => {
    const { getTokenFromRequest, verifyToken } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue("token");
    vi.mocked(verifyToken).mockReturnValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      nickname: "TestUser",
      feishuWebhook: null,
    } as any);

    const res = await handler(makeRequest({ focusMinutes: 10, distractMinutes: 2 }));
    const data = await res.json();
    expect(data.sent).toBe(false);
    expect(data.reason).toContain("未配置");
  });

  it("returns sent:false when webhook URL is invalid", async () => {
    const { getTokenFromRequest, verifyToken } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue("token");
    vi.mocked(verifyToken).mockReturnValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      nickname: "TestUser",
      feishuWebhook: "https://evil.com/hook",
    } as any);

    const res = await handler(makeRequest({ focusMinutes: 5, distractMinutes: 3 }));
    const data = await res.json();
    expect(data.sent).toBe(false);
    expect(data.reason).toContain("不合法");
  });

  it("sends notification and returns sent:true on success", async () => {
    const { getTokenFromRequest, verifyToken } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue("token");
    vi.mocked(verifyToken).mockReturnValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      nickname: "Alice",
      feishuWebhook: "https://open.feishu.cn/open-apis/bot/v2/hook/test123",
    } as any);

    // Mock global fetch for the feishu API call
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ StatusCode: 0 }), { status: 200 }),
    );

    const res = await handler(makeRequest({ focusMinutes: 25, distractMinutes: 5 }));
    const data = await res.json();
    expect(data.sent).toBe(true);

    // Verify fetch was called with correct feishu webhook
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/bot/v2/hook/test123",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Verify message content
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.msg_type).toBe("text");
    expect(callBody.content.text).toContain("GESP.AI");
    expect(callBody.content.text).toContain("Alice");
    expect(callBody.content.text).toContain("25");
    expect(callBody.content.text).toContain("5");

    fetchSpy.mockRestore();
  });

  it("returns sent:false when feishu API returns error", async () => {
    const { getTokenFromRequest, verifyToken } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue("token");
    vi.mocked(verifyToken).mockReturnValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      nickname: "Bob",
      feishuWebhook: "https://open.feishu.cn/open-apis/bot/v2/hook/test456",
    } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("keyword not match", { status: 400 }),
    );

    const res = await handler(makeRequest({ focusMinutes: 10, distractMinutes: 3 }));
    const data = await res.json();
    expect(data.sent).toBe(false);
    expect(data.reason).toContain("错误");

    fetchSpy.mockRestore();
  });

  it("sanitizes nickname with special characters", async () => {
    const { getTokenFromRequest, verifyToken } = await import("@/lib/auth");
    vi.mocked(getTokenFromRequest).mockReturnValue("token");
    vi.mocked(verifyToken).mockReturnValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      nickname: "<script>alert(1)</script>",
      feishuWebhook: "https://open.feishu.cn/open-apis/bot/v2/hook/test789",
    } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ StatusCode: 0 }), { status: 200 }),
    );

    await handler(makeRequest({ focusMinutes: 10, distractMinutes: 2 }));

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    // Should not contain < > characters
    expect(callBody.content.text).not.toContain("<script>");
    expect(callBody.content.text).not.toContain("</script>");

    fetchSpy.mockRestore();
  });
});

// ---- test-webhook tests ----

describe("POST /api/parent/test-webhook", () => {
  let handler: typeof import("@/app/api/parent/test-webhook/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        user: { findUnique: vi.fn() },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getUserFromRequest: vi.fn(),
    }));

    const mod = await import("@/app/api/parent/test-webhook/route");
    handler = mod.POST;
  });

  function makeRequest(body: object) {
    return new Request("http://localhost/api/parent/test-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify(body),
    }) as any;
  }

  it("returns 401 when not logged in", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");
    vi.mocked(getUserFromRequest).mockResolvedValue(null);

    const res = await handler(makeRequest({ webhookUrl: "https://open.feishu.cn/hook" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when webhookUrl is empty", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");
    vi.mocked(getUserFromRequest).mockResolvedValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const res = await handler(makeRequest({ webhookUrl: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-feishu webhook URL", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");
    vi.mocked(getUserFromRequest).mockResolvedValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const res = await handler(makeRequest({ webhookUrl: "https://hooks.slack.com/xxx" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("不合法");
  });

  it("sends test message and returns success", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");
    vi.mocked(getUserFromRequest).mockResolvedValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ nickname: "TestKid" } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ StatusCode: 0 }), { status: 200 }),
    );

    const res = await handler(
      makeRequest({ webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/abc" }),
    );
    const data = await res.json();
    expect(data.message).toContain("测试消息已发送");

    // Verify message contains GESP keyword (required for feishu custom keyword filter)
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.content.text).toContain("GESP");
    expect(callBody.content.text).toContain("TestKid");

    fetchSpy.mockRestore();
  });

  it("returns 400 when feishu rejects the message", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");
    vi.mocked(getUserFromRequest).mockResolvedValue({ userId: 1, email: "test@test.com", role: "user" } as any);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ nickname: "Kid" } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"code":19024,"msg":"Key Words Not Found"}', { status: 400 }),
    );

    const res = await handler(
      makeRequest({ webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/abc" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("飞书返回错误");

    fetchSpy.mockRestore();
  });
});
