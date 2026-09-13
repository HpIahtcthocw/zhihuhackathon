/** 提取 JSON —— 容忍模型夹带解释文字或 ```json 围栏 */
export function extractJSON(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1) throw new Error("LLM 输出中找不到 JSON");
  const slice = end > start ? text.slice(start, end + 1) : text.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    const repaired = repairJSON(slice);
    if (repaired == null) throw new Error("LLM 输出 JSON 无法修复");
    return JSON.parse(repaired);
  }
}

/** 容错修复：尾逗号、字符串内裸换行、截断时的括号自动闭合 */
function repairJSON(text: string): string | null {
  let t = text;
  // 1) 去掉 ,} 或 ,] 前的尾逗号（字符串外）——粗略替换，风险低
  t = t.replace(/,\s*([}\]])/g, "$1");
  // 2) 字符串内的裸换行转义
  t = t.replace(/:\s*"([^"]*)"/g, (m) => m.replace(/\r?\n/g, "\\n"));
  try {
    JSON.parse(t);
    return t;
  } catch {
    /* 继续修复 */
  }
  // 3) 截断修复：回退到最后一个完整元素，补齐缺失的括号
  const stack: string[] = [];
  let inStr = false, esc = false, lastSafe = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") stack.pop();
    else if ((c === "," || c === "}") && stack.length >= 1) lastSafe = i;
  }
  if (lastSafe <= 0) return null;
  let cut = t.slice(0, lastSafe + 1);
  cut = cut.replace(/,\s*$/, "");
  // 重新扫描补括号
  const st: string[] = [];
  inStr = false; esc = false;
  for (const c of cut) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") st.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") st.pop();
  }
  if (inStr) cut += '"';
  return cut + st.reverse().join("");
}
