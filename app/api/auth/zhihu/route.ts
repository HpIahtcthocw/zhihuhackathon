import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 知乎 OAuth 登录：发起授权（预留能力）。
   注意：知乎开放平台的 app_id / app_key 不开放自助申请，需邮件 product-platform@zhihu.com
   申请（OAuth 接入文档 + 授权范围）。未配置凭证时本路由 302 到 ?oauth=unconfigured，
   前端保持登录按钮隐藏，不影响主流程。 */

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
