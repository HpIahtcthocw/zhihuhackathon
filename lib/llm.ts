import { extractJSON } from "./extract";

/* LLM 通道：DashScope（OpenAI 兼容协议）。
   forge 用质量模型（CROSSROAD_MODEL），rebuttal 用快速模型（CROSSROAD_MODEL_FAST）。 */
const MODEL =
  process.env.CROSSROAD_MODEL || process.env.LORE_MODEL_MAIN || "qwen3.8-max-0902";
const MODEL_FAST =
  process.env.CROSSROAD_MODEL_FAST || process.env.LORE_MODEL_FAST || "qwen3.8-flash";

export { extractJSON };

export async function complete(
  system: string,
  user: string,
  maxTokens = 4000,
  model?: string,
): Promise<string> {
  const t0 = Date.now();
  const usedModel = model || MODEL;
  const text = await dashscope(system, user, maxTokens, usedModel);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[LLM] ${usedModel} ${dt}s text_len=${text.length}`);
  if (!text) throw new Error("LLM 返回空文本");
  return text;
}

export async function completeFast(
  system: string,
  user: string,
  maxTokens = 1500,
): Promise<string> {
  return complete(system, user, maxTokens, MODEL_FAST);
}

async function dashscope(
  system: string,
  user: string,
  maxTokens: number,
  model: string,
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");
  const base =
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode";
  const url = `${base.replace(/\/$/, "")}/v1/chat/completions`;
  // qwen3.8/kimi 系是思考模型：关闭思考后延迟从 110s+ 降到 ~3s
  const isThinker = /qwen3\.|kimi-k/.test(model);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.6,

      ...(isThinker ? { enable_thinking: false } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(40_000), // 单次40s：2次尝试+兜底，卡进 EdgeOne 120s
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DashScope ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  console.log(`[LLM] finish=${data.choices?.[0]?.finish_reason ?? "?"}`);
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
