import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 知乎 OAuth 登录：发起授权。
   凭证来自赛事页面（创建项目后分配），配置以下环境变量后启用：
   ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY / ZHIHU_OAUTH_REDIRECT_URI(可选，默认派生自请求来源) */

export async function GET(req: NextRequest) {
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const origin = req.nextUrl.origin;
  if (!appId) {
    return Response.redirect(`${origin}/?oauth=unconfigured`, 302);
  }
  const redirectUri =
    process.env.ZHIHU_OAUTH_REDIRECT_URI || `${origin}/api/auth/zhihu/callback`;

  // state：绑定浏览器会话（HttpOnly 短时 cookie），回调时校验
  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://openapi.zhihu.com/authorize");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("app_id", appId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);

  const res = Response.redirect(authorize.toString(), 302);
  const headers = new Headers(res.headers);
  headers.append(
    "Set-Cookie",
    `zh_oauth_state=${state}; Path=/; HttpOnly; Secure; Max-Age=600; SameSite=Lax`,
  );
  return new Response(null, { status: 302, headers });
}
