import { extractJSON } from "./extract";

/* LLM 通道优先级：
   1. DashScope（通义千问，OpenAI 兼容协议）—— 当前已验证可用
   2. Anthropic（含中转站）—— token 失效时自动跳过 */
const MODEL =
  process.env.CROSSROAD_MODEL || process.env.LORE_MODEL_MAIN || "qwen-max";

export { extractJSON };

export async function complete(
  system: string,
  user: string,
  maxTokens = 4000,
): Promise<string> {
  const t0 = Date.now();
  const text = await dashscope(system, user, maxTokens);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[LLM] ${MODEL} ${dt}s text_len=${text.length}`);
  if (!text) throw new Error("LLM 返回空文本");
  return text;
}

async function dashscope(
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");
  const base =
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode";
  const url = `${base.replace(/\/$/, "")}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DashScope ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/* Anthropic 通道（备用；中转 token 失效时不可用） */
export async function anthropicComplete(
  system: string,
  user: string,
  maxTokens = 4000,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const c = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    ...(process.env.ANTHROPIC_BASE_URL
      ? { baseURL: process.env.ANTHROPIC_BASE_URL }
      : {}),
  });
  const res = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}
