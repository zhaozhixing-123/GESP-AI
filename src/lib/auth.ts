import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET 环境变量未设置");
  return s;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  tokenVersion?: number; // 改密时递增，旧 token 自动失效
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/** 仅解码校验 JWT 本身（签名 + 过期），不查数据库 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const p = jwt.verify(token, getJwtSecret()) as any;
    if (p.type === "parent") return null; // parent token 不能当用户 token 用
    return p as JwtPayload;
  } catch {
    return null;
  }
}

/** 遗留别名：保留旧名，行为等同 decodeToken */
export const verifyToken = decodeToken;

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * 从请求解析 token 并校验 tokenVersion 与数据库一致（改密后旧 token 自动失效）。
 * 需要严格认证的路由都应使用此函数。
 */
export async function getUserFromRequest(request: NextRequest): Promise<JwtPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  });
  if (!dbUser) return null;
  if ((payload.tokenVersion ?? 0) !== dbUser.tokenVersion) return null;

  return payload;
}

export async function requireAdmin(request: NextRequest): Promise<JwtPayload | Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  // 从数据库验证实时角色，不信任 JWT 中缓存的 role
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { role: true },
  });
  if (!dbUser || dbUser.role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  return { ...user, role: dbUser.role };
}
