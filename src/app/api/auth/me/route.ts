import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  return Response.json({
    user: { id: user.userId, username: user.username, role: user.role },
  });
}
