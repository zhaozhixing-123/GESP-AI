# GESP.AI 安全审计报告

> 审计时间：2026-04-13
> 审计范围：`src/` 目录下全部 API 路由、鉴权逻辑、前端组件、第三方集成
> 代码版本：当前 main 分支最新 commit

---

## 漏洞级别说明

| 级别 | 含义 |
|------|------|
| **P0 - 严重** | 可直接获取管理员权限、泄露全量数据、绕过支付、远程代码执行 |
| **P1 - 高危** | 可越权操作他人数据、绕过核心业务限制、泄露敏感信息 |
| **P2 - 中危** | 可滥用资源、间接信息泄露、逻辑缺陷可被利用 |
| **P3 - 低危** | 安全最佳实践缺失、潜在风险但利用难度高 |

---

## P0 - 严重漏洞

### 1. SSRF（服务端请求伪造）—— Webhook 接口可攻击内网

**文件**：`src/app/api/parent/test-webhook/route.ts:15`、`src/app/api/focus/notify/route.ts:35`

**问题**：`test-webhook` 接口接受用户任意传入的 `webhookUrl`，服务端直接 `fetch(webhookUrl)`，**没有校验 URL 是否为合法的飞书地址**。攻击者可以传入内网地址（如 `http://169.254.169.254/latest/meta-data/`、`http://localhost:5432/` 等），服务端会替攻击者发起请求，从而：

- 探测和访问内网服务（数据库、Redis、云 metadata API）
- 获取云服务器的 IAM 凭证（如 AWS/GCP/Azure metadata）
- 端口扫描内网

`focus/notify` 接口中，`feishuWebhook` 虽然来自数据库，但用户可以通过 parent PUT 接口写入任意 URL，同样存在此问题。

**修复建议**：

```typescript
// 白名单校验，只允许飞书域名
function isValidFeishuWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.feishu.cn');
  } catch {
    return false;
  }
}
```

---

### 2. JWT role 信息缓存在 Token 中，权限提升后不生效 / 降权后不失效

**文件**：`src/lib/auth.ts:16-18`、`src/app/api/auth/register/route.ts:58-62`

**问题**：JWT Payload 中包含 `role: string`，token 有效期 7 天。但 `requireAdmin()` 只验证 JWT 中的 role 字段，**从不查询数据库中的实时 role**。这意味着：

- 如果管理员被降级为普通用户，其旧 token 在 7 天内**仍然拥有管理员权限**
- 如果数据库中被删除的用户，其 token 仍然有效（虽然部分操作会因为外键约束失败）

这在管理后台有**清空所有题目**（`DELETE /api/admin/problems/clear`）这样的危险操作的情况下，风险很高。

**修复建议**：

```typescript
export async function requireAdmin(request: NextRequest): Promise<JwtPayload | Response> {
  const jwtUser = getUserFromRequest(request);
  if (!jwtUser) return Response.json({ error: "未登录" }, { status: 401 });
  
  // 从数据库验证实时角色
  const dbUser = await prisma.user.findUnique({
    where: { id: jwtUser.userId },
    select: { role: true },
  });
  if (!dbUser || dbUser.role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  return { ...jwtUser, role: dbUser.role };
}
```

---

### 3. 支付回调 notifyUrl 由客户端 origin 决定，可伪造

**文件**：`src/app/api/payment/create/route.ts:33-38`

**问题**：

```typescript
const origin = request.headers.get("origin") ?? "https://gesp.ai";
const { qrcodeUrl } = await createXunhuOrder({
  notifyUrl: `${origin}/api/payment/notify`,
  // ...
});
```

`notifyUrl` 直接使用请求的 `Origin` header 拼接。攻击者可以设置 `Origin: https://evil.com`，那么虎皮椒回调就会发送到 `https://evil.com/api/payment/notify`，攻击者可以：

1. 拦截回调获取订单信息
2. 伪造回调通知（如果同时知道 XUNHU_APPSECRET 的话）

虽然回调有签名验证，但 notifyUrl 应该是服务端固定配置，绝不应由客户端控制。

**修复建议**：

```typescript
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://gesp.ai";
// ...
notifyUrl: `${SITE_ORIGIN}/api/payment/notify`,
returnUrl: `${SITE_ORIGIN}/payment/success`,
```

---

## P1 - 高危漏洞

### 4. 硬编码 fallback JWT Secret

**文件**：`src/app/api/parent/route.ts:7`

**问题**：

```typescript
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";
```

如果环境变量 `JWT_SECRET` 未配置（部署遗漏、测试环境泄露等），所有用户的 JWT 和 parent token 都使用 `"fallback-secret"` 签名。攻击者可以直接伪造任意用户的 token，包括 admin token。

注意：`src/lib/auth.ts` 中的 `getJwtSecret()` 正确地在缺失时 throw error，但 `parent/route.ts` 绕过了它，自己写了一个 fallback。

**修复建议**：删除 fallback，复用 `getJwtSecret()` 或直接 throw：

```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET 未配置");
```

---

### 5. 登录/注册无速率限制——暴力破解可行

**文件**：`src/app/api/auth/login/route.ts`、`src/app/api/auth/register/route.ts`

**问题**：登录和注册接口**没有任何频率限制**（no rate limiting）。攻击者可以：

- 对登录接口进行暴力破解（密码最短只要 6 位）
- 批量注册垃圾用户占用数据库资源

**修复建议**：

- 添加基于 IP 的速率限制（如 `next-rate-limit` 或 `upstash/ratelimit`）
- 登录失败 N 次后临时锁定账号
- 添加验证码（CAPTCHA）

---

### 6. AI 对话接口无速率限制——Claude API 账单轰炸

**文件**：`src/app/api/chat/route.ts`、`src/app/api/wrongbook/analyze/route.ts`、`src/app/api/exam/review/route.ts`

**问题**：付费用户对 AI 老师的对话**没有任何频率限制**。攻击者只需一个付费账号（¥99），就可以无限并发调用 Claude Opus 4.6 API，造成大量 API 费用。Claude Opus 的 API 成本很高，一个恶意用户就可能造成数千元的 API 账单。

模考诊断接口 `/api/exam/review` 甚至**不检查付费状态**，免费用户也可以无限调用。

**修复建议**：

- 添加全局 API 速率限制（per-user per-minute）
- 每日/每小时对话次数上限
- AI 接口添加并发控制（同一用户同时只能有一个 AI 请求在处理）

---

### 7. 用户名无字符过滤——XSS/注入风险

**文件**：`src/app/api/auth/register/route.ts:14`

**问题**：注册时只检查用户名长度（2-20），**不过滤特殊字符**。用户名可以包含 `<script>alert(1)</script>` 或 SQL 特殊字符。虽然 Prisma 防止了 SQL 注入，React 默认转义了 HTML，但用户名在以下场景可能未被转义：

- 飞书 Webhook 通知的文本消息中（`focus/notify` 直接拼接 `user.username`）
- 未来可能添加的 dangerouslySetInnerHTML 场景

**修复建议**：

```typescript
if (!/^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(username)) {
  return Response.json({ error: "用户名只能包含字母、数字、中文、下划线和横线" }, { status: 400 });
}
```

---

### 8. admin 路由仅前端守卫，无服务端 layout 级保护

**文件**：`src/app/admin/layout.tsx`（目前不存在独立的鉴权逻辑）

**问题**：admin 页面的前端用 NavBar 控制显隐，但 admin 页面目录 `src/app/admin/` 没有服务端中间件或 layout 级鉴权。虽然 API 路由有 `requireAdmin()` 保护，但 admin 前端页面本身**可以被任何人直接访问**（只是数据加载会 401），这暴露了管理后台的 UI 结构和接口地址信息。

**修复建议**：在 `src/app/admin/layout.tsx` 添加服务端鉴权检查，或使用 Next.js middleware 拦截 `/admin/*` 路径。

---

## P2 - 中危漏洞

### 9. 提交代码无长度限制——资源滥用 & Judge0 成本

**文件**：`src/app/api/submissions/route.ts:17`、`src/app/api/run/route.ts:27`、`src/app/api/variants/[id]/submit/route.ts:19`

**问题**：代码提交只检查 `code?.trim()` 不为空，**没有长度上限**。攻击者可以提交超大代码（如 10MB），导致：

- 数据库存储膨胀（code 字段存储完整代码）
- Judge0 API 处理超大代码消耗资源
- 内存压力

**修复建议**：

```typescript
if (code.length > 50000) {
  return Response.json({ error: "代码长度不能超过 50000 字符" }, { status: 400 });
}
```

---

### 10. AI 对话消息无长度限制——Prompt 注入 & 成本

**文件**：`src/app/api/chat/route.ts:17`

**问题**：用户消息只检查 `message?.trim()` 不为空，没有长度限制。攻击者可以发送超长消息（几十 KB），消耗大量 Claude API 的 input token 费用。此外，用户可以通过精心构造的长 prompt 进行 **Prompt Injection**，试图让 AI 老师绕过"不给答案"的限制。

**修复建议**：

```typescript
if (message.length > 2000) {
  return Response.json({ error: "消息长度不能超过 2000 字符" }, { status: 400 });
}
```

---

### 11. 错误信息泄露内部细节

**文件**：`src/app/api/submissions/route.ts:151`、多个 API 路由的 catch 块

**问题**：

```typescript
return Response.json(
  { error: e.message || "提交失败，请重试" },
  { status: 500 }
);
```

多个 API 路由将 `e.message` 直接返回给客户端。这可能泄露内部信息，如：

- 数据库连接字符串或错误
- Prisma 内部错误信息（包含表名、字段名）
- Judge0 API 密钥前缀或错误详情
- 文件路径信息

**修复建议**：500 错误只返回通用消息，详细信息只写 server log：

```typescript
console.error("Submission error:", e);
return Response.json({ error: "提交失败，请重试" }, { status: 500 });
```

---

### 12. 付费墙绕过——变形题对话跳过免费检查

**文件**：`src/app/api/chat/route.ts:24-28`

**问题**：

```typescript
// 变形题对话跳过付费墙（入口已受 VariantUnlock 保护），真题走正常流程
if (!variantId) {
  const allowed = await checkFreeLimit(user.userId, parseInt(problemId));
  // ...
}
```

变形题的 AI 对话完全跳过了付费检查。注释说"入口已受 VariantUnlock 保护"，但 VariantUnlock 记录是在**真题 WA 时自动创建的**。所以一个免费用户可以：

1. 用免费的 1 道题故意提交错误代码 → 获得 VariantUnlock
2. 然后对变形题**无限次调用 AI 对话**（绕过了真题的 5 次限制）

**修复建议**：变形题对话也应检查免费用户的对话次数限制。

---

### 13. 模考诊断接口无付费检查

**文件**：`src/app/api/exam/review/route.ts`、`src/app/api/exam/problems/route.ts`

**问题**：`/api/exam/problems` 和 `/api/exam/review` 只检查用户登录，**不检查付费状态**。免费用户可以无限次使用模拟考试功能，每次都触发 Claude Opus 4.6 生成诊断报告（max_tokens=4000），造成 API 费用。

**修复建议**：添加付费检查或对免费用户限制模考次数。

---

### 14. 支付金额浮点精度风险

**文件**：`src/app/api/payment/notify/route.ts:46`

**问题**：

```typescript
const notifyAmount = Math.round(parseFloat(params.total_fee) * 100);
```

浮点运算存在精度问题，如 `parseFloat("19.90") * 100 = 1989.9999999999998`。虽然 `Math.round` 通常能处理这个情况，但在极端数值下可能导致金额验证失败（拒绝合法支付）或通过（接受篡改金额）。

**修复建议**：

```typescript
// 用字符串处理避免浮点问题
const parts = params.total_fee.split('.');
const yuan = parseInt(parts[0]) * 100;
const fen = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2)) : 0;
const notifyAmount = yuan + fen;
```

---

## P3 - 低危漏洞

### 15. JWT Token 存储在 localStorage——XSS 可窃取

**文件**：`src/app/login/page.tsx`、`src/components/Navbar.tsx` 等多处

**问题**：JWT token 存储在 `localStorage` 中。如果应用存在任何 XSS 漏洞（包括未来引入的第三方库），攻击者可以通过 `localStorage.getItem("token")` 窃取用户 token。

**修复建议**（长期）：将 JWT 改为 `HttpOnly` + `Secure` + `SameSite=Strict` 的 Cookie，前端无法通过 JavaScript 读取。

---

### 16. 缺少 CSRF 保护

**文件**：所有 POST/PUT/PATCH/DELETE API 路由

**问题**：API 使用 Bearer Token 认证，存储在 localStorage 中，并通过 `Authorization` header 传递。这种模式天然抵抗传统的 CSRF 攻击（因为 CSRF 无法设置自定义 header）。但如果未来改为 Cookie 认证，就需要添加 CSRF token。

当前风险低，但需要在架构演进时注意。

---

### 17. 缺少安全响应头

**文件**：`next.config.ts`（未找到安全头配置）

**问题**：应用缺少常见的安全 HTTP 响应头：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`（防止点击劫持）
- `Content-Security-Policy`（防 XSS）
- `Strict-Transport-Security`（强制 HTTPS）
- `Referrer-Policy`

**修复建议**：在 `next.config.ts` 中添加 security headers：

```typescript
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

---

### 18. 防作弊措施可被轻松绕过

**文件**：`src/components/FocusTracker.tsx:160-167`

**问题**：防作弊逻辑（禁用右键、禁用 F12）在客户端 JavaScript 中实现，攻击者可以：

- 在加载页面前通过浏览器扩展禁用这些事件拦截
- 通过 DevTools Protocol（远程调试）绕过 F12 禁用
- 直接修改 localStorage 中的 `focus_data` 伪造专注时间

这些措施只能防止不懂技术的小学生，无法防止有技术能力的用户。这不算严格意义上的安全漏洞，但不应依赖它作为真正的防作弊手段。

---

### 19. 注册时第一个用户自动成为 admin 的竞态条件

**文件**：`src/app/api/auth/register/route.ts:39-41`

**问题**：

```typescript
const userCount = await prisma.user.count();
const isFirstUser = userCount === 0;
const role = isFirstUser ? "admin" : "user";
```

在并发场景下，如果两个请求几乎同时到达，可能 `count()` 都返回 0，导致**两个用户都获得 admin 权限**。虽然这只在初始部署时有风险，但可以通过数据库唯一约束或事务解决。

**修复建议**：使用数据库事务 + 创建后再检查：

```typescript
const user = await prisma.$transaction(async (tx) => {
  const count = await tx.user.count();
  return tx.user.create({
    data: { ...data, role: count === 0 ? "admin" : "user" },
  });
});
```

---

### 20. 密码策略过于宽松

**文件**：`src/app/api/auth/register/route.ts:20`

**问题**：密码只要求 >= 6 个字符，没有复杂度要求。用户可以使用 `123456`、`aaaaaa` 等弱密码，增加暴力破解风险。

**修复建议**：至少要求包含字母和数字的组合，或使用弱密码黑名单。

---

### 21. Admin 后台清空操作缺少二次确认机制

**文件**：`src/app/api/admin/problems/clear/route.ts`

**问题**：`DELETE /api/admin/problems/clear` 会删除**全部题目和所有关联数据**（聊天记录、错题本、提交记录），这是一个极其危险的操作。服务端只检查了 admin 权限，没有二次确认机制（如要求传入确认字符串）。

一旦 admin token 泄露，攻击者一个请求就可以删除所有数据。

**修复建议**：要求传入确认参数：

```typescript
const { confirm } = await request.json();
if (confirm !== "DELETE_ALL_PROBLEMS") {
  return Response.json({ error: "请传入确认字符串" }, { status: 400 });
}
```

---

## 漏洞汇总

| # | 级别 | 漏洞名称 | 文件 |
|---|------|----------|------|
| 1 | **P0** | SSRF——Webhook URL 无域名校验 | `parent/test-webhook`, `focus/notify` |
| 2 | **P0** | JWT role 缓存不实时验证 | `lib/auth.ts`, `register/route.ts` |
| 3 | **P0** | 支付 notifyUrl 由客户端 Origin 控制 | `payment/create/route.ts` |
| 4 | **P1** | 硬编码 fallback JWT Secret | `parent/route.ts` |
| 5 | **P1** | 登录/注册无速率限制 | `auth/login`, `auth/register` |
| 6 | **P1** | AI 接口无速率限制——账单轰炸 | `chat`, `wrongbook/analyze`, `exam/review` |
| 7 | **P1** | 用户名无字符过滤 | `auth/register` |
| 8 | **P1** | Admin 页面无服务端鉴权 | `app/admin/` |
| 9 | **P2** | 提交代码无长度限制 | `submissions`, `run`, `variants/submit` |
| 10 | **P2** | AI 消息无长度限制 | `chat/route.ts` |
| 11 | **P2** | 错误信息泄露内部细节 | 多个 API catch 块 |
| 12 | **P2** | 变形题对话绕过付费墙 | `chat/route.ts` |
| 13 | **P2** | 模考诊断无付费检查 | `exam/review`, `exam/problems` |
| 14 | **P2** | 支付金额浮点精度风险 | `payment/notify` |
| 15 | **P3** | JWT 存 localStorage | 前端多处 |
| 16 | **P3** | 缺少 CSRF 保护 | 全局 |
| 17 | **P3** | 缺少安全响应头 | `next.config.ts` |
| 18 | **P3** | 防作弊措施可客户端绕过 | `FocusTracker.tsx` |
| 19 | **P3** | 首个用户 admin 竞态条件 | `auth/register` |
| 20 | **P3** | 密码策略过于宽松 | `auth/register` |
| 21 | **P3** | Admin 清空操作无二次确认 | `admin/problems/clear` |

---

## 修复优先级建议

**立即修复（本周）**：
1. #1 SSRF —— 添加飞书域名白名单校验
2. #3 支付 notifyUrl —— 改为服务端环境变量
3. #4 fallback JWT Secret —— 删除 fallback

**尽快修复（两周内）**：
4. #2 JWT role 实时验证
5. #5 登录注册添加速率限制
6. #6 AI 接口添加速率限制和并发控制
7. #9 #10 输入长度限制
8. #11 错误信息脱敏

**计划修复（一个月内）**：
9. #7 用户名字符过滤
10. #12 #13 补全付费检查
11. #14 支付金额处理
12. #17 安全响应头
13. #21 危险操作二次确认

**长期改进**：
14. #15 JWT 改为 HttpOnly Cookie
15. #20 密码策略加强
16. #8 Admin layout 鉴权
