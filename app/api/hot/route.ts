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
};

/* 热榜缓存：1 小时。热榜 100 次/天、搜索 1000 次/天，必须省着用 */
const TTL = 3600 * 1000;
let cache: { at: number; items: HotItem[] } | null = null;

const QUERIES = ["要不要裸辞", "该不该转行", "考研还是工作", "大城市还是老家"];

async function fetchHotList(secret: string): Promise<HotItem[]> {
  const url = new URL("https://developer.zhihu.com/api/v1/content/hot_list");
  url.searchParams.set("Limit", "10");
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
    .map((it: Record<string, unknown>) => ({
      title: String(it?.Title ?? "").slice(0, 80),
      metrics: "知乎热榜",
      excerpt: String(it?.Summary ?? "").slice(0, 200),
      url: String(it?.Url ?? ""),
      votes: 10_000, // 热榜条目默认置顶权重
      comments: 0,
      isHot: true,
    }));
}

export async function GET(_req: NextRequest) {
  if (cache && Date.now() - cache.at < TTL) {
    return Response.json({ items: cache.items, cached: true });
  }
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) {
    return Response.json({ items: [], cached: false, error: "ZHIHU_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const [hotItems, results] = await Promise.all([
      fetchHotList(secret).catch(() => [] as HotItem[]),
      Promise.all(
        QUERIES.map(async (q) => {
          const url = new URL("https://developer.zhihu.com/api/v1/content/zhihu_search");
          url.searchParams.set("Query", q);
          url.searchParams.set("Count", "3");
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
          }));
        }),
      ),
    ]);
    const seen = new Set<string>();
    const all = [...hotItems, ...results.flat()].filter(
      (it) => it.title && !seen.has(it.title) && seen.add(it.title),
    );
    // 热榜条目置顶；搜索条目按赞同数阈值过滤
    const hot = all.filter((it) => it.isHot).slice(0, 4);
    const searched = all
      .filter((it) => !it.isHot)
      .sort((a, b) => b.votes - a.votes);
    const strong = searched.filter((it) => it.votes >= 40);
    const relaxed = searched.filter((it) => it.votes >= 8);
    const items = [...hot, ...(strong.length >= 4 ? strong : relaxed).slice(0, 6)];
    if (items.length) cache = { at: Date.now(), items };
    return Response.json({ items, cached: false });
  } catch (err) {
    console.error("[hot] 知乎搜索失败:", err instanceof Error ? err.message : err);
    return Response.json({ items: [], cached: false, error: "UPSTREAM_ERROR" }, { status: 502 });
  }
}
