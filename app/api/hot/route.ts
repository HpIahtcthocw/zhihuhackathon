import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type HotItem = {
  title: string;
  metrics: string;
  excerpt: string;
  url: string;
  votes: number;
  comments: number;
  isHot?: boolean; // 来自知乎真热榜 hot_list
  cat: string; // 困境类别：事业/爱情/友情/原生家庭/心理健康/金钱/自我成长
};

/* 热榜缓存：1 小时。热榜 100 次/天、搜索 1000 次/天，必须省着用。
   刷新失败（限频/网络）时回退最近一份成功数据（stale 兜底），避免整页降级离线剧本。 */
const TTL = 3600 * 1000;
let cache: { at: number; items: HotItem[] } | null = null;
let stale: { at: number; items: HotItem[] } | null = null;

/* 困境不止事业：覆盖爱情、友情、原生家庭、心理健康、金钱、自我成长等类别 */
const QUERIES: { q: string; cat: string }[] = [
  { q: "要不要裸辞", cat: "事业" },
  { q: "考研还是工作", cat: "事业" },
  { q: "该不该回老家", cat: "事业" },
  { q: "转行 来得及吗", cat: "事业" },
  { q: "该不该结婚", cat: "爱情" },
  { q: "异地恋 该不该坚持", cat: "爱情" },
  { q: "和朋友闹掰 怎么和好", cat: "友情" },
  { q: "存钱 没有安全感", cat: "金钱" },
  { q: "原生家庭 父母", cat: "原生家庭" },
  { q: "爸妈总反对我 怎么办", cat: "原生家庭" },
  { q: "焦虑 内耗 怎么办", cat: "心理健康" },
  { q: "晚上失眠 精神内耗", cat: "心理健康" },
  { q: "25岁 人生很迷茫", cat: "自我成长" },
];
const CAT_FALLBACK = "自我成长";
const catRules: [RegExp, string][] = [
  [/裸辞|转行|考研|工作|裁员|辞职|跳槽|副业|创业|回老家|应届|升职|offer/g, "事业"],
  [/分手|恋爱|对象|结婚|相亲|异地|前任|离婚|暧昧|表白/g, "爱情"],
  [/朋友|友谊|绝交|闺蜜|吵架|冷淡/g, "友情"],
  [/爸妈|父母|原生家庭|家暴|母亲|父亲|重男轻女/g, "原生家庭"],
  [/焦虑|抑郁|失眠|内耗|压力|emo|情绪崩溃|空心病/g, "心理健康"],
  [/存钱|攒钱|存款|年薪|月光|负债|买房|财务/g, "金钱"],
  [/迷茫|意义|人生|30岁|35岁|未来/g, "自我成长"],
];
function categorize(title: string): string {
  for (const [re, cat] of catRules) if (re.test(title)) return cat;
  return CAT_FALLBACK;
}

/* 内置离线话题池：知乎鉴权失败/限频/断网时的最后兜底（7 类全覆盖）。
   保证热榜接口永不 502，前端始终有货可聊。 */
const OFFLINE_POOL: HotItem[] = [
  { title: "程序员未来是不是会大量失业？", metrics: "5,599 万 热度 · 历史抓取", excerpt: "", url: "", votes: 5599, comments: 0, cat: "事业" },
  { title: "现在该不该裸辞？就业行情一般，裸辞风险值不值得承担？", metrics: "3,287 万 热度 · 历史抓取", excerpt: "", url: "", votes: 3287, comments: 0, cat: "事业" },
  { title: "25岁，该不该转行？感觉现在的工作一眼望到头。", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 900, comments: 0, cat: "事业" },
  { title: "恋爱三年对方父母不同意，这段感情该不该继续？", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 800, comments: 0, cat: "爱情" },
  { title: "异地恋五年，要不要为了对方放弃现在的工作和城市？", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 750, comments: 0, cat: "爱情" },
  { title: "和认识十年的好朋友因为钱闹掰了，还能和好吗？", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 700, comments: 0, cat: "友情" },
  { title: "爸妈从小否定我，做什么都想先看他们脸色。", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 1200, comments: 0, cat: "原生家庭" },
  { title: "一直被拿去跟别人比，越来越焦虑失眠。", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 950, comments: 0, cat: "心理健康" },
  { title: "存不下钱，总觉得没有安全感。", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 850, comments: 0, cat: "金钱" },
  { title: "毕业第三年突然很空，职业和人生都没有方向。", metrics: "离线补充 · 历史抓取", excerpt: "", url: "", votes: 1100, comments: 0, cat: "自我成长" },
];

async function fetchHotList(secret: string): Promise<HotItem[]> {
  const url = new URL("https://developer.zhihu.com/api/v1/content/hot_list");
  url.searchParams.set("Limit", "30");
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.Data?.Items ?? [];
  return items
    .filter((it: Record<string, unknown>) => String(it?.Title ?? "").length > 8)
    .map((it: Record<string, unknown>) => {
      const title = String(it?.Title ?? "").slice(0, 80);
      return {
        title,
        metrics: "知乎热榜",
        excerpt: String(it?.Summary ?? "").slice(0, 200),
        url: String(it?.Url ?? ""),
        votes: 10_000, // 热榜条目默认置顶权重
        comments: 0,
        isHot: true,
        cat: categorize(title),
      };
    });
}

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL) {
    return Response.json({ items: cache.items, cached: true });
  }
  const fallBack = (reason: string) => {
    console.warn(`[hot] ${reason}，使用 stale/内置池兜底`);
    if (stale?.items.length) {
      return Response.json({ items: stale.items, cached: true, stale: true });
    }
    return Response.json({ items: OFFLINE_POOL, cached: false, stale: true, offline: true });
  };
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) {
    const fb = fallBack("未配置密钥");
    if (fb) return fb;
    return Response.json({ items: OFFLINE_POOL, cached: false, stale: true, offline: true });
  }
  try {
    const fetchSearch = async (q: string, cat: string): Promise<HotItem[]> => {
      const url = new URL("https://developer.zhihu.com/api/v1/content/zhihu_search");
      url.searchParams.set("Query", q);
      url.searchParams.set("Count", "8");
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${secret}`,
          "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = data?.Data?.Items ?? data?.data?.items ?? [];
      return items.map((it: Record<string, unknown>) => ({
        title: String(it?.Title ?? "").replace(/\s*-\s*知乎$/, "").slice(0, 80),
        metrics: `${Number(it?.VoteUpCount ?? 0).toLocaleString()} 赞同 · ${Number(it?.CommentCount ?? 0).toLocaleString()} 评论`,
        excerpt: String(it?.ContentText ?? "").replace(/\s+/g, " ").slice(0, 200),
        url: String(it?.Url ?? ""),
        votes: Number(it?.VoteUpCount ?? 0),
        comments: Number(it?.CommentCount ?? 0),
        cat,
      }));
    };
    // 搜索词分批串行（并发 3），避免 13 路并发触发知乎限频只成功前几路
    const searchItems: HotItem[] = [];
    const BATCH = 3;
    for (let i = 0; i < QUERIES.length; i += BATCH) {
      const batch = QUERIES.slice(i, i + BATCH);
      const settled = await Promise.all(
        batch.map((quo) => fetchSearch(quo.q, quo.cat).catch(() => [] as HotItem[])),
      );
      for (const items of settled) searchItems.push(...items);
      if (i + BATCH < QUERIES.length) await new Promise((r) => setTimeout(r, 250));
    }
    const hotItems = await fetchHotList(secret).catch(() => [] as HotItem[]);
    const seen = new Set<string>();
    const all = [...hotItems, ...searchItems].filter(
      (it) => it.title && !seen.has(it.title) && seen.add(it.title),
    );
    // 热榜条目置顶；搜索条目按赞同数排序，高赞优先，赞数不足则放宽保住下拉栏数量
    const hot = all.filter((it) => it.isHot).slice(0, 8);
    const searched = all
      .filter((it) => !it.isHot && it.title)
      .sort((a, b) => b.votes - a.votes);
    const strong = searched.filter((it) => it.votes >= 40);
    const pool = strong.length >= 6 ? strong : searched;
    const items = [...hot, ...pool.slice(0, 12)];
    if (items.length) {
      cache = { at: Date.now(), items };
      stale = cache;
      return Response.json({ items, cached: false });
    }
    const fb = fallBack("上游返回空（鉴权失败/限频 20001/30001）");
    if (fb) return fb;
    return Response.json({ items: OFFLINE_POOL, cached: false, stale: true, offline: true });
  } catch (err) {
    console.error("[hot] 知乎搜索失败:", err instanceof Error ? err.message : err);
    const fb = fallBack("上游异常");
    if (fb) return fb;
    return Response.json({ items: OFFLINE_POOL, cached: false, stale: true, offline: true });
  }
}
