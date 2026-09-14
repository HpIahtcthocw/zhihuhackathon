import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const keys = Object.keys(process.env).filter((k) =>
    /ZHIHU|DASHSCOPE|ANTHROPIC|CROSSROAD|NEXT_PUBLIC|LORE|SUPABASE/.test(k),
  );
  return Response.json({
    count: keys.length,
    keys: keys.sort(),
    hasSecret: Boolean(process.env.ZHIHU_ACCESS_SECRET),
    secretPreview: process.env.ZHIHU_ACCESS_SECRET
      ? process.env.ZHIHU_ACCESS_SECRET!.slice(0, 8) + "…" + process.env.ZHIHU_ACCESS_SECRET!.slice(-4)
      : null,
  });
}
