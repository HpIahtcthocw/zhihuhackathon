# 豆包任务书：《岔路口》文案收尾 + 编译实测验收

## 背景
- 项目：`E:\gitproject\hackathon\crossroad`（Next.js 14，知乎黑客松参赛游戏「岔路口·知乎围炉」）。
- 游戏主体是单文件 `public/game/index.html`（原生 JS）；LLM 提示词在 `app/api/forge/route.ts`（围炉编译器）与 `app/api/rebuttal/route.ts`（回怼）。
- **边界：只改文案与提示词字符串，不改任何功能、流程、模型、架构。不要动 `.env.local`。**
- 已完成：共鸣铁律已写入 forge（"9. 共鸣铁律：三轮质询中至少两轮引用玩家处境的原话…"）；危机/对线标签、超时文案已改。
- 以下 6 处修改**尚未应用**（此前补丁中断），逐条照做。

## 待改 6 处（均在 public/game/index.html，用精确原文匹配替换）

### 1. 反馈标签池化
找（在函数 applyAndAdvance 内）：
```
  fb.innerHTML=fbHtml+`<div class="fx">${parts.join("")}</div>`;
```
改为：
```
  const FBLAB=["全场反应：","桌上的声音：","看山记了一笔："];
  const fbLab=FBLAB[Math.floor(Math.random()*FBLAB.length)];
  fb.innerHTML=`<b>${fbLab}</b>${fbHtml}<div class="fx">${parts.join("")}</div>`;
```

### 2. 编译提示拼入困境关键词
找（async function forgeAndStart 内）：
```
  const tips=["拉取真实争议上下文…","孵化四位答主人格…","排列三轮质询与对线冲突点…","推演十二个月命运分岔…"];
```
改为：
```
  const short=dilemma.replace(/[，。？！?!,.\s]/g,"").slice(0,8);
  const tips=[`正在为「${short}」翻真实回答…`,"孵化四位答主人格…","排列三轮质询与对线冲突点…","推演十二个月命运分岔…"];
```

### 3. 弹幕池扩到 20 条
找 `const CROWD=[`（12 条的数组，最后一项是 `"围观群众：看山记得管管场面",`），在其 `];` 前追加 8 条：
```
  "围观群众：楼上冷静点","围观群众：我先笑为敬","围观群众：这不就是我上周的对话吗",
  "围观群众：作为家里反对的那方，我有话说","围观群众：怎么每一个字都在说我","围观群众：记下了，明天就提离职（不是）",
  "围观群众：旁边嗑瓜子的问一下结局","围观群众：这桌比我家年夜饭还热闹",
```

### 4. Hero 副题平实化
找：
```
      <p>选一个真实知乎争议，或写下你的困境。四位由真实回答与精选评论孵化的答主会质询你、和你对线——然后陪你把这一年推演完。</p>
```
改为：
```
      <p>选一个真实知乎争议，或写下你自己的。四位答主会质询你、和你对线，再把这一年推演完。别急，看山也在。</p>
```

### 5. 直答标签去术语
找：`知乎直答 · 基于社区内容的参考口径`，改为：`知乎直答 · 社区里的主流说法`

### 6. 回怼反馈语感池化
找（async function sendRebuttal 内）：
```
    const impactTxt={strong:"你的回怼击中要害，对面让步了",partial:"有道理，但被抓住了漏洞",weak:"这记回怼被轻松驳回"}[d.impact];
```
改为：
```
    const impactPool={
      strong:["你的回怼击中要害，对面让步了","反对者张了张嘴，最后点了头","这一句把桌子说安静了"],
      partial:["有道理，但被抓住了漏洞","双方各让半步，天平轻轻晃了一下","话站住了，代价也摆上了桌"],
      weak:["这记回怼被轻轻放下去了，像放下一杯凉茶","对面笑了笑，没接这句","论证没站住，被一句顶了回来"]
    };
    const pool=impactPool[d.impact]||impactPool.partial;
    const impactTxt=pool[Math.floor(Math.random()*pool.length)];
```

### 7.（可选，若 JSON 解析失败率高）降温度
`lib/llm.ts` 里 `temperature: 0.6` 改为 `0.5`。

## 编译实测（改完后执行）

1. 启动：`cd E:\gitproject\hackathon\crossroad && npm run dev -- -p 8900`（等 Ready）。
2. 连跑 3 个困境（PowerShell 里用 UTF-8 文件体发 POST，避免中文乱码：先把 body 写成 UTF-8 json 文件再 `curl --data-binary @文件`）：
   - A：`{"dilemma":"34岁，存款40万，要不要回老家县城买房躺平？","consText":"资金韧性：略有结余；搞钱能力：远程接单；心理落差：勉强应付"}`
   - B：`{"dilemma":"当下,你敢裸辞吗?","consText":"存款水位：够6个月；时间窗口：半年；退路：没有"}`
   - C：`{"dilemma":"异地恋五年，要不要为了对方放弃深圳的工作去成都？","consText":"感情浓度：灵魂伴侣；职业底气：平薪跳槽；后方阻力：中立观望"}`
   端点：`POST http://localhost:8900/api/forge`
3. 每个响应做 4 项断言（Python/Node 均可，注意 UTF-8）：
   - HTTP 200 且 `topic` 存在；
   - AI 腔正则零命中：`不是[^，。]{1,12}，而是`、`真正的[^。]{1,8}是`、`记住[：:]`；
   - 处境引用：body（advisors/rounds/months/clash）里至少出现 consText 的一个关键词（如"远程/半年/灵魂伴侣"）；
   - 结构完整：advisors=4、rounds=3（各 2 opts）、months=4、endings 4 种。
4. 失败处理：单条失败直接重跑一次（服务端有 3 次自动重试）；若"months 不足 4"连续出现，把 forge SYSTEM 里的铁律 9 再精简一半；若 JSON 断裂，确认 `lib/extract.ts` 的 repairJSON 存在且未被改动。
5. 全部通过后：`git add -A && git commit -m "文案收尾+共鸣铁律实测通过"`（网络可用时 push）。

## 验收口径（给用户的最终判据）
- 读者测试：把 3 局的 R1 质询贴出来盲读，应分不清是 AI 生成还是真人写的知乎回答开头；
- 共鸣测试：质询里能找到你选的处境原话（如"远程接单"），即"它记得我说的话"。
