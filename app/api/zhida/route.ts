import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* 知乎直答 Agent：基于知乎社区内容生成可信参考回答。
   限额 100 次/天 —— 按 dilemma 缓存 24h，够用。 */
const TTL = 24 * 3600 * 1000;
const cache = new Map<string, { text: string; at: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { dilemma?: string };
    const dilemma = (body?.dilemma ?? "").trim();
    if (!dilemma || dilemma.length > 80) {
      return Response.json({ error: "invalid dilemma" }, { status: 400 });
    }
    const key = createHash("sha1").update(dilemma).digest("hex");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      return Response.json({ text: hit.text, cached: true });
    }

    const secret = process.env.ZHIHU_ACCESS_SECRET;
    if (!secret) return Response.json({ error: "ZHIHU_NOT_CONFIGURED" }, { status: 503 });

    const res = await fetch("https://developer.zhihu.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "zhida-fast-1p5",
        stream: false,
        messages: [
          {
            role: "user",
            content: `围绕这个人生困境：「${dilemma}」。请以知乎社区讨论的视角，给出社区中的主流观点与建议（120 字以内，克制、承认不确定性，不给绝对结论）。不要以“根据知乎”开头。`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[zhida] 上游错误:", res.status, t.slice(0, 150));
      return Response.json({ error: "UPSTREAM_ERROR" }, { status: 502 });
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return Response.json({ error: "EMPTY" }, { status: 502 });

    cache.set(key, { text: text.slice(0, 300), at: Date.now() });
    return Response.json({ text: text.slice(0, 300), cached: false });
  } catch (err) {
    console.error("[zhida] 失败:", err instanceof Error ? err.message : err);
    return Response.json({ error: "UPSTREAM_ERROR" }, { status: 502 });
  }
}
