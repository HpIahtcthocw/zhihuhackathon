/** 提取 JSON —— 容忍模型夹带解释文字或 ```json 围栏 */
export function extractJSON(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM 输出中找不到 JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}
