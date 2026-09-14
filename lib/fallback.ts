/* ── 离线围炉模板生成器 ──
 * 当 LLM 编译失败/超时时秒回一个围绕用户困境动态生成的结构完整围炉，
 * 保证接口永不 502、前端全流程永远可跑通。内容为 AI 孵化的通用观点人格，
 * 严格围绕用户困境原文的关键实体展开，不虚构知乎真实数据。
 */

const COLORS = ["#b44632", "#315b73", "#66705a", "#8590a6", "#b6843d"];

export type Fx = { scale?: number; cash?: number; mood?: number; opp?: number; fam?: number };

export type ForgeTopic = {
  hot: string;
  q: string;
  heat: string;
  follows: string;
  views: string;
  desc: string;
  src: string;
  srcTag: string;
  aiCompiled: boolean;
  advisors: Array<{ id: string; ch: string; name: string; bio: string; color: string; votes: number; open: string; cmt: string }>;
  rounds: Array<{ by: string; press: string; text: string; opts: Array<{ t: string; fx: Fx; reply: string; vt?: string }> }>;
  clash: { L: { name: string; p: string; btn: string; fx: Fx }; R: { name: string; p: string; btn: string; fx: Fx } };
  months: Array<{ m: string; src: string; text: string; L: { t: string; fx: Fx; log: string; delay?: string }; R: { t: string; fx: Fx; log: string; delay?: string } }>;
  endings: { crash: { t: string; v: string }; bold: { t: string; v: string }; steady: { t: string; v: string }; fence: { t: string; v: string } };
};

const fx = (o: Partial<Fx>): Fx => ({
  scale: o.scale ?? 0, cash: o.cash ?? 0, mood: o.mood ?? 0, opp: o.opp ?? 0, fam: o.fam ?? 0,
});

/* 从困境里挖出可复用的「实体词」：数字、方位、城市、动作短语，用于让模板内容锚定困境原文 */
function entities(dilemma: string) {
  const nums = dilemma.match(/\d+[个岁年万]?/g)?.slice(0, 3) ?? ["现在"];
  const city = dilemma.match(/[A-Za-z\u4e00-\u9fa5]{2,6}(?:市|县|城|镇|深圳|北京|上海|广州|杭州|成都|南京|老家|家乡|外地)/)?.[0] ?? "";
  const place = city || "新的地方";
  return { nums, place };
}

export function makeFallback(dilemma: string, input: { save?: string; time?: string; back?: string }): ForgeTopic {
  const d = dilemma.trim();
  const { nums, place } = entities(d);
  const n1 = nums[0] ?? "现在";
  const n2 = nums[1] ?? n1;

  const advisors = [
    {
      id: "safe", ch: "稳", name: "安稳派",
      bio: "算过账的老财务",
      color: COLORS[0], votes: 0,
      open: `先说结论：别急着动。<b>${n1}</b>的筹码，换「${place}」的入场券，你要先算清沉没成本。把「要不要去」拆成三个账：钱账、情账、退路账，三本都平了再谈冲动。`,
      cmt: "「典型观点：稳字当头，先把退路留够再谈折腾。」",
    },
    {
      id: "bold", ch: "闯", name: "闯荡派",
      bio: "裸辞三年过来人",
      color: COLORS[1], votes: 0,
      open: `利益相关：当年${n1}也问过同样的问题。<b>机会不等人</b>——你现在的犹豫不是理性，是恐惧穿了理性的外套。去，然后让那个环境逼你成长，别让老家把你这点血性磨没了。`,
      cmt: "「典型观点：最怕的不是选错，是十年后还在问同一句。」",
    },
    {
      id: "wise", ch: "老", name: "过来人",
      bio: "中年回望型答主",
      color: COLORS[2], votes: 0,
      open: `不请自来。我见过的跳槽去「${place}」的人，一半后悔，一半庆幸，区别不在城市，在<b>你带没带真本事</b>。先回答自己：你去是逃，还是追？逃的人到哪都逃，追的人在哪都能活。`,
      cmt: "「典型观点：城市是放大器，不是救生圈。」",
    },
    {
      id: "risk", ch: "疑", name: "风险派",
      bio: "专泼冷水的风控",
      color: COLORS[3], votes: 0,
      open: `反对最高票。你们都只谈上限，不谈下限——<b>去了之后最坏的样子你想过吗</b>？租房押一付三、社保断档、前三个月没收入，这一串现实砸下来，你确认扛得住？扛不住，就别拿人生做概率游戏。`,
      cmt: "「典型观点：热血上头时，记得先看存款余额。」",
    },
  ];

  const rounds = [
    {
      by: "risk", press: "质询",
      text: `你嘴上说想去「${place}」，可你摸过自己兜里吗？<b>${n1}的你</b>，换城市第一个月就要花掉大半积蓄。你打算靠什么撑过没收入的头三个月？`,
      opts: [
        {
          t: "先把存款算清，设一个能回头的止损线再去", fx: fx({ scale: 2, cash: 1, mood: 1, opp: 2, fam: 0 }),
          reply: "风险派点点头：「至少你还知道给自己留条后路。」安稳派补充：「止损线设好了，这局才不算赌。」", vt: "risk",
        },
        {
          t: "不回头了，破釜沉舟把退路全断掉再走", fx: fx({ scale: 5, cash: -3, mood: 2, opp: 4, fam: -2 }),
          reply: "闯荡派拍案：「这才对，人一有退路就开始找借口。」过来人皱眉：「退路断得太绝，出事时没人接你。」", vt: "bold",
        },
      ],
    },
    {
      by: "wise", press: "追问",
      text: `<b>${n1}这个节点</b>，你说去「${place}」是为了什么？如果只是换个地方继续现在的生活，那你在老家也能过；如果你是去抢一个「现在的自己够不着的机会」——说出来，我们帮你掂量。`,
      opts: [
        {
          t: "是去够一个更大的平台和圈层，机会在老家的三倍", fx: fx({ scale: 3, cash: -1, mood: 0, opp: 5, fam: -1 }),
          reply: "过来人点头：「有目标就好办，怕的是为走而走。」安稳派补刀：「平台是别人的，本事是自己的。」", vt: "wise",
        },
        {
          t: "就是想换个活法，不想一辈子被看见底", fx: fx({ scale: 4, cash: 0, mood: 3, opp: 2, fam: -1 }),
          reply: "闯荡派：「这理由够了，多少人一辈子没敢承认。」风险派冷笑：「换活法不换能力，三个月后一样焦虑。」", vt: "bold",
        },
      ],
    },
    {
      by: "safe", press: "最后一问",
      text: `最后一问，我只问数字：<b>去了「${place}」，你的收入曲线第几个月能打平？</b>回答得出来，说明你算过；回答不出来，说明你只是在赌运气。`,
      opts: [
        {
          t: "按现在的能力估算，大概第六个月能打平", fx: fx({ scale: 2, cash: 2, mood: 1, opp: 2, fam: 0 }),
          reply: "安稳派：「数字能对上，这题就及格了。」过来人提醒：「打平只是起点，别把及格当赢。」", vt: "safe",
        },
        {
          t: "打不了平，但我想赌一把大的", fx: fx({ scale: 6, cash: -4, mood: 0, opp: 5, fam: -2 }),
          reply: "闯荡派：「赌大的才配叫重头开始！」风险派摇头：「记住你今天这句话，崩盘时别怨环境。」", vt: "bold",
        },
      ],
    },
  ];

  return {
    hot: "自定义困境",
    q: d,
    heat: "—",
    follows: "—",
    views: "—",
    desc: `四位立场互不相让的知乎答主，正围绕「${d.slice(0, 18)}」摆开阵势。`,
    src: "",
    srcTag: "离线模板 · LLM 编译暂时不可用，AI 观点人格代班",
    aiCompiled: false,
    advisors,
    rounds,
    clash: {
      L: { name: "闯荡派 · 去", p: `${n1}不搏，${n2}徒伤悲。机会窗口就这几年，拖到没了锐气。`, btn: "站去：搏一把", fx: fx({ scale: 5, cash: -2, mood: 2, opp: 4 }) },
      R: { name: "安稳派 · 留", p: `现在动，等于用确定的「${n1}」换不确定的明天。稳下来攒筹码，时机到了再动不迟。`, btn: "站留：先稳住", fx: fx({ scale: -2, cash: 2, mood: 0, opp: -2 }) },
    },
    months: [
      {
        m: "第 1 个月", src: "『落脚账单 · 由风险派的「算清沉没成本」主张触发』",
        text: `到「${place}」的第一个月，<b>房租押一付三、置办生活</b>，存款肉眼可见地掉了一截。你盯着账单，想起那句「先算三本账」。`,
        L: { t: "按预算执行，记账防超支", fx: fx({ cash: 1, mood: 0, opp: 0 }), log: "预算守住，心略慌" },
        R: { t: "先租贵点的，住好才有状态", fx: fx({ cash: -2, mood: 2, opp: 0 }), log: "住舒服了，钱流得快", delay: "第 3 个月：月底见底，被迫接了个低价活" },
      },
      {
        m: "第 3 个月", src: "『机会窗口 · 由闯荡派的「机会不等人」主张触发』",
        text: `一个「${place}」本地圈子的内推机会递到你面前，<b>待遇比现在高，但要求三个月内做出成绩</b>。接，还是再观望？`,
        L: { t: "先摸清底细再决定", fx: fx({ opp: 1, mood: 0 }), log: "错过半拍，机会冷了" },
        R: { t: "当场应下，先上车再说", fx: fx({ scale: 3, cash: 2, opp: 4, mood: 1 }), log: "上了车，压力翻倍", delay: "第 6 个月：业绩没达标，试用期被谈话" },
      },
      {
        m: "第 6 个月", src: "『老家来电 · 由安稳派的「情账」主张触发』",
        text: `家里打来电话，<b>「在外面混得怎么样？不行就回来」</b>。这句话在深夜特别响。你想起当初那句「有退路，大不了回头」。`,
        L: { t: "报喜不报忧，咬牙撑住", fx: fx({ fam: -1, mood: -1 }), log: "一个人扛着" },
        R: { t: "跟家里摊牌真实处境", fx: fx({ fam: 2, mood: 1 }), log: "家成了后盾" },
      },
      {
        m: "第 12 个月", src: "『年终复盘 · 由过来人的「追还是逃」主张触发』",
        text: `一年之期到了。你坐在「${place}」的出租屋里盘点：<b>钱没攒下多少，但见过的人、碰过的事，和一年前完全不同</b>。这局，值不值？`,
        L: { t: "认了，继续沉淀", fx: fx({ scale: 1, cash: 1, opp: 2, mood: 1 }), log: "站稳了，慢但稳" },
        R: { t: "发现这不是我要的，计划下一步", fx: fx({ scale: 2, cash: 0, opp: 1, mood: -1 }), log: "又要动，但更清醒" },
      },
    ],
    endings: {
      crash: { t: "冲动裸奔者", v: `「${place}」没亏待你，是你高估了自己。第${n1 === "现在" ? "" : ""}12 个月，你带着一身疲惫和一张单程票的教训回来，逢人就说「大城市也就那样」。` },
      bold: { t: "破局者", v: `你赌对了。第 12 个月的你，站在「${place}」的写字楼里，回头看那晚的纠结，笑自己当初怕得太多。当初那点血性，值回票价。` },
      steady: { t: "稳中求进者", v: `你没all in，也没原地踏步。一年下来，你在「${place}」站稳了脚跟，存款曲线向上，心里那杆秤也终于摆平。稳，本身就是一种快。` },
      fence: { t: "原地打转者", v: `一年过去，你还在「去不去」的问题里打转。城市没换，焦虑没少，只有日历悄悄翻了一整年。有些问题，问得太久就成了答案。` },
    },
  };
}
