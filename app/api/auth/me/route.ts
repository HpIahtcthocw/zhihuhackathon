import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 读取当前知乎登录态（zh_session HttpOnly cookie）→ 供前端刷新后保持登录展示 */
export async function GET(req: NextRequest) {
  const raw = req.cookies.get("zh_session")?.value;
  if (!raw) return Response.json({ ok: false });
  try {
    const u = JSON.parse(decodeURIComponent(raw)) as { name?: unknown; avatar?: unknown };
    const name = typeof u.name === "string" ? u.name.slice(0, 30) : "";
    if (!name) return Response.json({ ok: false });
    return Response.json({ ok: true, name, avatar: typeof u.avatar === "string" ? u.avatar : "" });
  } catch {
    return Response.json({ ok: false });
  }
}
