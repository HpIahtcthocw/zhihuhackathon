import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { complete, extractJSON } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── 答主可选颜色（与前端视觉系统一致） ── */
const COLORS = ["#b44632", "#315b73", "#66705a", "#8590a6", "#b6843d"];

type ForgeInput = {
  dilemma: string;
  save?: string; // 3m | 6m | 12m
  time?: string; // urgent | mid | loose
  back?: string; // yes | no
};

type Fx = { scale?: number; cash?: number; mood?: number; opp?: number; fam?: number };

type ForgeTopic = {
  hot: string;
  q: string;
  heat: string;
  follows: string;
  views: string;
  desc: string;
  src: string;
  srcTag: string;
  aiCompiled: true;
  advisors: Array<{ id: string; ch: string; name: string; bio: string; color: string; votes: number; open: string; cmt: string }>;
  rounds: Array<{ by: string; press: string; text: string; opts: Array<{ t: string; fx: Fx; reply: string; vt?: string }> }>;
  clash: { L: { name: string; p: string; btn: string; fx: Fx }; R: { name: string; p: string; btn: string; fx: Fx } };
  months: Array<{ m: string; src: string; text: string; L: { t: string; fx: Fx; log: string; delay?: string }; R: { t: string; fx: Fx; log: string; delay?: string } }>;
  endings: { crash: ET; bold: ET; steady: ET; fence: ET };
};
type ET = { t: string; v: string };

/* ── 进程内缓存：同一困境 24h 内不重复编译（应对 LLM 成本与延迟） ── */
const TTL = 24 * 3600 * 1000;
const cache = new Map<string, { topic: ForgeTopic; at: number }>();
function cacheKey(input: ForgeInput) {
  return createHash("sha1")
    .update(`${input.dilemma}|${input.save}|${input.time}|${input.back}`)
    .digest("hex");
}

const SYSTEM = `你是知乎黑客松参赛作品《岔路口》的「围炉编译器」。用户会给你一个真实的人生困境，你要把它编译成一场可玩的围炉辩论：四位立场鲜明的知乎答主围绕用户的困境交锋，三轮质询，一次对线，十二个月命运推演。

写作铁律：
1. 忠于原意：必须保留用户困境里的关键实体（年龄、城市、职业、金额、关系等），不得偷换主题、不得扩大或缩小问题（如「去深圳重头开始」不能变成「创业」）；
2. 知乎味：每位答主的 open 开场必须用高赞回答的开场白——「先说结论」「泻药」「利益相关」「反对最高票」「不请自来」等开头，论证具体、有数字细节、敢下判断；
3. 四位答主立场必须真正对立且有质的差异，各自盯住困境的不同侧面（如：风险侧、机会侧、钱侧、身心侧、过来人经验侧）；
4. 质询要扎心：每轮针对用户困境里最疼的那个点；选项必须 20-35 字、含一个具体动作和一个可感知的代价或收益（如「辞掉现在年薪 15 万的工作，用 6 个月存款换全职备考」），两个选项是真实的价值取舍，没有明显正确答案；
5. 事件卡必须能追溯到某位答主的某个主张（src 字段写明因果），延迟后果要呼应第 1 个月的选择；m 字段固定使用「第 1 个月」「第 3 个月」「第 6 个月」「第 12 个月」；
6. 诚实约束：不得编造任何知乎真实数据（不虚构赞同数、不虚构真实用户、不冒充历史事件）；答主是 AI 孵化的观点人格；cmt 字段标注为「典型观点」而非真实评论；
7. 若困境是社会事件或他人故事而非个人决策（如热榜新闻），把玩家设定为事件核心当事人的视角来编译（如学历歧视事件 → 当事人视角「要不要公开回应」），desc 中说明这一设定；
8. 只输出 JSON，不要任何解释文字。`;

function userPrompt(input: ForgeInput, driftFeedback?: string): string {
  const cons = `存款水位=${input.save ?? "6m"}（3m=紧张/6m=尚可/12m=充裕）, 时间窗口=${input.time ?? "mid"}（urgent=很急/mid=半年/loose=一年以上）, 退路=${input.back ?? "no"}（yes=有退路/no=破釜沉舟）`;
  return `${driftFeedback ?? ""}用户的困境：「${input.dilemma}」
用户的牌面：${cons}

JSON 的 "q" 字段已由系统固定，直接原样输出「${input.dilemma}」，不要改写、不要扩写。其余所有字段（advisors/rounds/clash/months/endings）必须逐字围绕「${input.dilemma}」中的具体抉择展开，禁止替换成别的困境、禁止增加用户没说的前提（不要虚构城市、薪资、存款数字）。

请编译围炉。严格输出以下 JSON 结构（所有中文文案，fx 数值范围：scale -12~12，cash/mood/opp/fam -12~10）：
{
  "q": "（已固定，原样输出）",
  "desc": "一句话介绍这场围炉（30-50字）",
  "advisors": [恰好4个：{"id":"英文id","ch":"单字姓氏","name":"2-3字称呼","bio":"身份+立场（12字内）","color":"从 ${COLORS.join("/")} 中选","votes":0,"open":"开场回答（60-90字，以「先说结论」「泻药」「利益相关」「反对最高票」「不请自来」之一开头，含<b>加粗</b>一处）","cmt":"一条呼应其立场的『评论区典型观点』引语（30字内，注明是典型观点而非真实评论）"}],
  "rounds": [恰好3轮：{"by":"某位advisor的id","press":"质询|追问|最后一问","text":"质询内容（60-90字，含<b>加粗</b>一处）","opts":[恰好2个：{"t":"玩家的应对（20-35字，含一个具体动作和一个可感知的代价）","fx":{"scale":数值,"cash":数值,"mood":数值,"opp":数值,"fam":数值},"reply":"选完后全场的反应（40-60字，常让另一位答主开口）","vt":"被说服/激怒的advisor id"}]}],
  "clash": {"L":{"name":"答主名 · 立场","p":"观点（40字内）","btn":"站X：口号（10字内）","fx":{...}},"R":{同构, 立场必须与L相反}},
  "months": [恰好4个，m 依次为「第 1 个月」「第 3 个月」「第 6 个月」「第 12 个月」：{"m":"…","src":"『XX事件 · 由某答主的某主张触发』","text":"事件（50-70字，含<b>加粗</b>一处）","L":{"t":"选择（10字内）","fx":{...},"log":"时间线记录（15字内）"},"R":{同构}}],
  "endings": {"crash":{"t":"崩盘命运称号（7字内）","v":"判词（50-70字）"},"bold":{"t":"冒险成功称号","v":"判词"},"steady":{"t":"稳健成功称号","v":"判词"},"fence":{"t":"观望结局称号","v":"判词"}}
}

要求：第1个月R选项如果埋了延迟后果，加 "delay":"第N个月：……"（30-50字）；4个月事件必须覆盖不同生活侧面（钱/人际/机会/意外）；endings 的四种命运要有真区别，判词要有余味不说教。

最后自查（输出前逐条确认，违反任何一条则重写）：
A. 所有字段是否严格围绕「${input.dilemma}」？有没有偷换主题、虚构用户没说的前提？
B. 每个 opt 是否 20-35 字且含具体动作+代价？
C. 每个 advisor 的 open 是否以知乎体开场白起手？
D. 输出是否为纯 JSON（无 markdown 围栏、无解释）？`;
}

/* 偏题检测：从困境中抽 CJK 二元组，检查输出正文（不含 q）的重合率。
   短困境（<12 个二元组）只要求命中 ≥1 个（过滤完全跑题的长输出）；
   长困境要求命中 ≥35%（过滤语义漂移）。 */
function driftRatio(topic: ForgeTopic, dilemma: string): number {
  const clean = dilemma.replace(/[，。？！、：；""''（）\s a-zA-Z0-9]/g, "");
  if (clean.length < 2) return 0;
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  const body = JSON.stringify({ d: topic.desc, a: topic.advisors, r: topic.rounds, c: topic.clash, m: topic.months, e: topic.endings });
  let hit = 0;
  grams.forEach((g) => { if (body.includes(g)) hit++; });
  const need = grams.size >= 12 ? Math.ceil(grams.size * 0.35) : 1;
  return hit >= need ? 0 : 1 - hit / grams.size;
}

/* ── 校验与钳制：LLM 输出一律不可信 ── */
function clampFx(fx: unknown): Fx {
  const o = (fx ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  return {
    scale: num(o.scale, -12, 12),
    cash: num(o.cash, -12, 10),
    mood: num(o.mood, -12, 10),
    opp: num(o.opp, -12, 10),
    fam: num(o.fam, -12, 10),
  };
}
const str = (v: unknown, fb: string, cap = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : fb;

function validate(raw: unknown, input: ForgeInput): ForgeTopic {
  const o = raw as Partial<ForgeTopic>;
  if (!Array.isArray(o.advisors) || o.advisors.length < 4) throw new Error("advisors 不足 4 位");
  if (!Array.isArray(o.rounds) || o.rounds.length < 3) throw new Error("rounds 不足 3 轮");
  if (!Array.isArray(o.months) || o.months.length < 4) throw new Error("months 不足 4 个");
  if (!o.clash?.L || !o.clash?.R) throw new Error("缺少 clash");
  if (!o.endings?.crash || !o.endings.bold || !o.endings.steady || !o.endings.fence)
    throw new Error("endings 不完整");

  const advisors = o.advisors.slice(0, 4).map((a, i) => ({
    id: str(a?.id, `adv${i + 1}`, 20),
    ch: str(a?.ch, "答", 2),
    name: str(a?.name, `答主${i + 1}`, 12),
    bio: str(a?.bio, "围炉答主", 20),
    color: COLORS.includes(String(a?.color)) ? String(a.color) : COLORS[i % COLORS.length],
    votes: 0,
    open: str(a?.open, "这个困境，我有话要说。", 400),
    cmt: str(a?.cmt, "「典型观点摘录」", 120),
  }));
  const ids = new Set(advisors.map((a) => a.id));

  const rounds = o.rounds.slice(0, 3).map((r, i) => {
    const opts = (r?.opts ?? []).slice(0, 2).map((op) => ({
      t: str(op?.t, `选项 ${i}`, 60),
      fx: clampFx(op?.fx),
      reply: str(op?.reply, "全场沉默了两秒。", 200),
      vt: op?.vt && ids.has(String(op.vt)) ? String(op.vt) : undefined,
    }));
    if (opts.length < 2) throw new Error(`第 ${i + 1} 轮选项不足`);
    return {
      by: r?.by && ids.has(String(r.by)) ? String(r.by) : advisors[i % 4].id,
      press: str(r?.press, i === 2 ? "最后一问" : "质询", 10),
      text: str(r?.text, "说说你的打算。", 400),
      opts,
    };
  });

  const mkSide = (s: { name?: unknown; p?: unknown; btn?: unknown; fx?: unknown }, fb: string) => ({
    name: str(s?.name, fb, 20),
    p: str(s?.p, fb, 80),
    btn: str(s?.btn, `站${fb.slice(0, 3)}`, 20),
    fx: clampFx(s?.fx),
  });

  const months = o.months.slice(0, 4).map((m, i) => ({
    m: str(m?.m, `第 ${i + 1} 个月`, 12),
    src: str(m?.src, "命运事件", 40),
    text: str(m?.text, "生活给出了新的考题。", 300),
    L: {
      t: str(m?.L?.t, "稳妥应对", 20),
      fx: clampFx(m?.L?.fx),
      log: str(m?.L?.log, "做了稳妥的选择", 24),
      ...(typeof m?.L?.delay === "string" && m.L.delay.trim() ? { delay: m.L.delay.trim().slice(0, 80) } : {}),
    },
    R: {
      t: str(m?.R?.t, "放手一搏", 20),
      fx: clampFx(m?.R?.fx),
      log: str(m?.R?.log, "选择了冒险", 24),
      ...(typeof m?.R?.delay === "string" && m.R.delay.trim() ? { delay: m.R.delay.trim().slice(0, 80) } : {}),
    },
  }));

  const endings = {
    crash: { t: str(o.endings.crash?.t, "孤注一掷者", 12), v: str(o.endings.crash?.v, "命运给了你一课。", 160) },
    bold: { t: str(o.endings.bold?.t, "破局者", 12), v: str(o.endings.bold?.v, "你走通了。", 160) },
    steady: { t: str(o.endings.steady?.t, "稳中求进者", 12), v: str(o.endings.steady?.v, "你稳住了。", 160) },
    fence: { t: str(o.endings.fence?.t, "原地打转者", 12), v: str(o.endings.fence?.v, "你还在想。", 160) },
  };

  return {
    hot: "自定义困境",
    q: str(o.q, input.dilemma, 60),
    heat: "—",
    follows: "—",
    views: "—",
    desc: str(o.desc, "四位答主正围绕你的困境列队。", 80),
    src: "",
    srcTag: "AI 围炉 · 由你的困境实时编译（非知乎历史）",
    aiCompiled: true,
    advisors,
    rounds,
    clash: { L: mkSide(o.clash.L, "正方"), R: mkSide(o.clash.R, "反方") },
    months,
    endings,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ForgeInput;
    const dilemma = (body?.dilemma ?? "").trim();
    if (dilemma.length < 6 || dilemma.length > 60) {
      return Response.json(
        { error: "困境长度需在 6-60 字之间", source: "invalid" },
        { status: 400 },
      );
    }

    const key = cacheKey({ ...body, dilemma });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      return Response.json({ topic: hit.topic, cached: true, source: "llm" });
    }

    // 最多两次：第二次带上偏题反馈重试
    let topic: ForgeTopic | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const feedback =
        attempt === 0
          ? undefined
          : `注意：你上一次的输出严重偏题，几乎没有围绕「${dilemma}」作答。重新编译，所有字段必须逐字围绕这个困境本身。\n\n`;
      const raw = await complete(SYSTEM, userPrompt(body, feedback), 4000);
      console.log(`[forge] raw head: ${raw.slice(0, 120).replace(/\n/g, " ")}`);
      const t = validate(extractJSON(raw), body);
      t.q = dilemma; // q 锚定为用户原话，杜绝标题漂移
      const drift = driftRatio(t, dilemma);
      console.log(`[forge] attempt=${attempt + 1} drift=${drift.toFixed(2)}`);
      if (drift <= 0.65) { topic = t; break; }
    }
    if (!topic) throw new Error("两次编译均偏题，已拦截");

    cache.set(key, { topic, at: Date.now() });
    return Response.json({ topic, cached: false, source: "llm" });
  } catch (err) {
    console.error("[forge] 编译失败:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "围炉编译暂时失败，可稍后重试或使用离线模板", source: "error" },
      { status: 502 },
    );
  }
}
