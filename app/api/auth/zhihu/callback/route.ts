import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 知乎 OAuth 回调：校验 state → 换 access_token → 读用户基础信息 → 会话 cookie → 回游戏页。
   预留能力：app_id/app_key 需邮件 product-platform@zhihu.com 申请（官方 OAuth 接入文档），
   未配置时前端不显示登录入口，本回调不会实际被调用。 */

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const redirectUri =
    process.env.ZHIHU_OAUTH_REDIRECT_URI || `${origin}/api/auth/zhihu/callback`;

  const fail = (msg: string) => Response.redirect(`${origin}/?oauth=error&reason=${encodeURIComponent(msg)}`, 302);
  if (!appId || !appKey) return fail("oauth 未配置");

  const code = req.nextUrl.searchParams.get("authorization_code")
    ?? req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("zh_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state 校验失败");
  }

  try {
    // 1) 换 access_token（form-urlencoded）
    const tokenRes = await fetch("https://openapi.zhihu.com/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) return fail(`token 交换失败 ${tokenRes.status}`);
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) return fail("token 缺失");

    // 2) 读用户基础信息
    const userRes = await fetch("https://openapi.zhihu.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!userRes.ok) return fail(`用户信息失败 ${userRes.status}`);
    const user = (await userRes.json()) as { name?: string; avatar_url?: string };
    const name = (user.name ?? "知友").slice(0, 30);
    const avatar = user.avatar_url ?? "";

    // 3) 会话 cookie（HttpOnly；Demo 用 token 直存，标注于代码评审说明）
    const back = Response.redirect(`${origin}/?welcome=${encodeURIComponent(name)}`, 302);
    const headers = new Headers(back.headers);
    headers.append("Set-Cookie",
      `zh_session=${encodeURIComponent(JSON.stringify({ name, avatar }))}; Path=/; HttpOnly; Secure; Max-Age=604800; SameSite=Lax`);
    headers.append("Set-Cookie", "zh_oauth_state=; Path=/; HttpOnly; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[oauth] 回调失败:", err instanceof Error ? err.message : err);
    return fail("授权流程异常");
  }
}
