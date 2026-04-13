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
  username: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

export function getUserFromRequest(request: NextRequest): JwtPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAdmin(request: NextRequest): Promise<JwtPayload | Response> {
  const jwtUser = getUserFromRequest(request);
  if (!jwtUser) return Response.json({ error: "未登录" }, { status: 401 });

  // 从数据库验证实时角色，不信任 JWT 中缓存的 role
  const dbUser = await prisma.user.findUnique({
    where: { id: jwtUser.userId },
    select: { role: true },
  });
  if (!dbUser || dbUser.role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  return { ...jwtUser, role: dbUser.role };
}
