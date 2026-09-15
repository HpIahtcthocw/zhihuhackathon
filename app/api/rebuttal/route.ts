import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { completeFast, extractJSON, safeHtml } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Input = {
  dilemma: string;
  roundText: string; // 本轮质询内容
  playerText: string; // 玩家的回怼
  advisors: Array<{ id: string; name: string; bio: string; open?: string }>;
};

type Output = {
  lines: Array<{ by: string; text: string }>;
  impact: "strong" | "partial" | "weak";
  summary: string;
};

const TTL = 3600 * 1000;
const cache = new Map<string, { out: Output; at: number }>();

const SYSTEM = `你在知乎黑客松游戏《岔路口》中扮演「围炉答主团」。用户正被四位知乎答主质询，现在用户亲口回怼了一句。你要以其中两位答主的口吻即兴接招。

写作铁律：
1. 每位答主严格保持自己的人设与立场（见输入的 bio），语气延续知乎高赞回答风格——具体、敢判断、有细节；
2. 恰好两位答主接话：一位立场与用户相近（被打动/点赞/补充论据），一位立场对立（反驳/让步/抓漏洞）；让步要体面，反驳要扎心，都不许和稀泥；
3. 回应必须直接引用或针对用户回怼的具体内容，禁止空泛套话；
4. impact 判定标准——strong：用户论点击中质询的要害，对立答主明确让步；partial：有道理但被抓到漏洞，双方各让半步；weak：论点站不住，被轻松驳回；
5. 去 AI 腔：禁止排比堆砌、禁止「不是A而是B」句式、禁止空洞大词；回应要像真人在饭桌上接话——具体、带情绪、可以不客气；
6. 只输出 JSON。`;

function prompt(i: Input): string {
  return `困境：「${i.dilemma}」
本轮质询：「${i.roundText}」
用户的回怼：「${i.playerText}」

四位答主人设：
${i.advisors.map((a) => `- id=${a.id} ${a.name}（${a.bio}）`).join("\n")}

严格输出：
{"lines":[{"by":"advisor id","text":"回应（40-70字，知乎味，针对用户原话）"},{"by":"另一位id","text":"…"}],"impact":"strong|partial|weak","summary":"全场反应一句话（30字内，如：反对者第一次没有立刻接话。）"}`;
}

function validate(raw: unknown, input: Input): Output {
  const o = raw as Partial<Output>;
  if (!Array.isArray(o.lines) || o.lines.length < 2) throw new Error("lines 不足");
  const ids = new Set(input.advisors.map((a) => a.id));
  const lines = o.lines
    .slice(0, 3)
    .filter((l) => l?.by && ids.has(String(l.by)) && typeof l.text === "string" && l.text.trim())
    .map((l) => ({ by: String(l.by), text: safeHtml(l.text.trim().slice(0, 160)) }));
  if (lines.length < 2) throw new Error("有效回应不足 2 条");
  const impact = o.impact === "strong" || o.impact === "partial" ? o.impact : "weak";
  return { lines, impact, summary: typeof o.summary === "string" && o.summary.trim() ? safeHtml(o.summary.trim().slice(0, 60)) : "全场安静了一瞬。" };
}

/* 交锋质量 → 确定性数值（LLM 不直接决定数值） */
const IMPACT_FX: Record<Output["impact"], { mood: number; opp: number }> = {
  strong: { mood: 8, opp: 4 },
  partial: { mood: 3, opp: 1 },
  weak: { mood: -6, opp: -2 },
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Input;
    const playerText = (body?.playerText ?? "").trim();
    if (!body?.dilemma || !playerText || playerText.length > 120) {
      return Response.json({ error: "回怼内容需在 1-120 字" }, { status: 400 });
    }
    if (!Array.isArray(body.advisors) || body.advisors.length < 2) {
      return Response.json({ error: "缺少答主人设" }, { status: 400 });
    }

    const key = createHash("sha1")
      .update(`${body.dilemma}|${body.roundText}|${playerText}`)
      .digest("hex");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      return Response.json({ ...hit.out, cached: true });
    }

    const raw = await completeFast(SYSTEM, prompt(body), 1200);
    const out = validate(extractJSON(raw), body);
    cache.set(key, { out, at: Date.now() });
    return Response.json(out);
  } catch (err) {
    console.error("[rebuttal] 失败:", err instanceof Error ? err.message : err);
    return Response.json({ error: "答主们一时语塞，稍后再试" }, { status: 502 });
  }
}
