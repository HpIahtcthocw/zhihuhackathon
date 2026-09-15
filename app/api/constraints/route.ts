import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { completeFast, extractJSON, safeHtml } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Option = { v: string; label: string; desc: string; fx: Record<string, number> };
type Constraint = { key: string; label: string; question: string; options: Option[] };

const TTL = 24 * 3600 * 1000;
const cache = new Map<string, { out: Constraint[]; at: number }>();

const SYSTEM = `你是游戏《岔路口》的设定师。玩家会给你一个人生困境，你要设计 3 个最能改变该困境走向的现实维度，供玩家入席前对齐处境。

铁律：
1. 维度必须贴合困境本身，禁止套模板（裸辞 → 存款水位/时间窗口/退路；异地恋该不该结婚 → 感情基础/异地时长/家庭态度；考研还是工作 → 备考底气/目标清晰度/家庭压力）；
2. question 用第二人称口语问玩家，12-20 字，像人说话，不要书面腔；
3. 每个维度恰好 3 个选项，从差到好排列；label 2-8 字，desc 是一句白描（≤14 字，具体、不抖机灵）；
4. fx 只用 cash/mood/opp/fam 四个键，范围 -25~25，三个选项要拉开差距（差选项偏低、好选项偏高），不同维度侧重的键不同；
5. 只输出 JSON。`;

function prompt(dilemma: string): string {
  return `困境：「${dilemma}」

严格输出：
{"constraints":[恰好3个：{"key":"英文小写","label":"维度名（2-6字）","question":"问玩家的话（12-20字）","options":[恰好3个：{"v":"英文","label":"选项（2-8字）","desc":"白描（≤14字）","fx":{"cash":数,"mood":数,"opp":数,"fam":数}}]}]}`;
}

function clampFx(fx: unknown): Record<string, number> {
  const o = (fx ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Math.max(-25, Math.min(25, Math.round(Number(v) || 0)));
  return { cash: num(o.cash), mood: num(o.mood), opp: num(o.opp), fam: num(o.fam) };
}

function validate(raw: unknown): Constraint[] {
  const o = raw as { constraints?: Constraint[] };
  if (!Array.isArray(o.constraints)) throw new Error("缺少 constraints");
  const out = o.constraints.slice(0, 3).map((c, i) => {
    const options = (c?.options ?? []).slice(0, 3).map((op, j) => ({
      v: safeHtml(String(op?.v ?? `o${j}`).slice(0, 16)),
      label: safeHtml(String(op?.label ?? `选项${j + 1}`).slice(0, 10)),
      desc: safeHtml(String(op?.desc ?? "").slice(0, 18)),
      fx: clampFx(op?.fx),
    }));
    if (options.length < 2) throw new Error(`维度${i + 1}选项不足`);
    return {
      key: safeHtml(String(c?.key ?? `dim${i + 1}`).slice(0, 16)),
      label: safeHtml(String(c?.label ?? `维度${i + 1}`).slice(0, 8)),
      question: safeHtml(String(c?.question ?? "").slice(0, 30)),
      options,
    };
  });
  if (out.length < 3) throw new Error("维度不足 3 个");
  return out;
}

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
      return Response.json({ constraints: hit.out, cached: true });
    }
    const raw = await completeFast(SYSTEM, prompt(dilemma), 1200);
    const out = validate(extractJSON(raw));
    cache.set(key, { out, at: Date.now() });
    return Response.json({ constraints: out, cached: false });
  } catch (err) {
    console.error("[constraints] 失败:", err instanceof Error ? err.message : err);
    return Response.json({ error: "UPSTREAM_ERROR" }, { status: 502 });
  }
}
