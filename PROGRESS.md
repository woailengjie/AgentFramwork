# 学习存档 · AI Agent 应用开发

> 最后更新：2026-11-18
> 用途：下次开新对话时，把本文件丢给我，我就能接着往下带。

---

## 一、背景与目标

- **你的背景**：Python 开发工程师，调过 LLM API、写过 demo，JavaScript 不熟。
- **目标**：面试 AI Agent 应用开发工程师。
- **周期**：3 个月以上，项目驱动。
- **技术栈决策**：Node.js + JavaScript 起步，L2 起迁移 TypeScript。
  理由：Vercel AI SDK、LangChain.js、LangGraph.js、MCP 官方 SDK 都是 TS 优先，
  用 JS 学一遍等于顺手补掉面试加分项。
- **代码仓库**：https://github.com/woailengjie/AgentFramwork （main 分支）

---

## 二、当前进度总览

```
L1 Agent 内核      ████████░ 80%   4 课已写完，1 个作业待做
L2 RAG 全链路      ██░░░░░░░ 25%   检索基础 2 课已写完
L3 框架与工程化    ░░░░░░░░░  0%
L4 面试冲刺        ░░░░░░░░░  0%
```

---

## 三、已完成课程清单

### L1 · Agent 内核

| 文件 | 核心内容 |
|---|---|
| [s1-core/llm.mjs](s1-core/llm.mjs) | 零依赖 LLM 客户端。用 Node 原生 `fetch` 直连 `/chat/completions`，无 API Key 时自动降级 mock。把 `usage` 挂到返回的 message 上供成本统计 |
| [s1-core/01-chat.mjs](s1-core/01-chat.mjs) | 解剖一次模型调用：messages 是什么、system/user 角色、顶层 await |
| [s1-core/02-react.mjs](s1-core/02-react.mjs) | 手写 ReAct 循环。4 个工具、工具结果回填、工具报错不中断、连续相同调用拦截、maxSteps 兜底 |
| [s1-core/03-structure-and-validation.mjs](s1-core/03-structure-and-validation.mjs) | 鲁棒 JSON 提取（代码块 / 注释 / 尾逗号 / 截断）+ JSON Schema 参数校验 + 校验失败把错误交还模型 |
| [s1-core/04-retry-timeout-cost.mjs](s1-core/04-retry-timeout-cost.mjs) | `withTimeout`（Promise.race）、`withRetry`（指数退避，只重试 5xx/429/网络错误）、`costTracker`（token 与成本累计） |

### L2 · RAG 全链路

| 文件 | 核心内容 |
|---|---|
| [s2-rag/01-bm25-retrieval.mjs](s2-rag/01-bm25-retrieval.mjs) | 手写 BM25：TF、IDF、文档长度归一化、k1/b 参数、中文单字分词 |
| [s2-rag/02-tfidf-vector-search.mjs](s2-rag/02-tfidf-vector-search.mjs) | TF-IDF 文档向量化 + cosine 相似度，理解"向量检索"到底在算什么 |

### 对照资料

- [python-reference/s1_core/](python-reference/s1_core) —— 最早用 Python 写的同样两课，留作语法对照，不再维护。

---

## 四、跑起来的方式

```bash
# 环境：Node v26.13.0（自带 fetch，全程零 npm 依赖）
cd s1-core
node 01-chat.mjs
node 02-react.mjs
node 03-structure-and-validation.mjs
node 04-retry-timeout-cost.mjs

cd ../s2-rag
node 01-bm25-retrieval.mjs
node 02-tfidf-vector-search.mjs
```

**配置模型**：复制 `s1-core/.env.example` 为 `s1-core/.env`：

```
LLM_API_KEY=你的key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

`.env` 已被 `.gitignore` 拦住，不会推到 GitHub。
不填 key 时全部脚本自动进 mock 模式，逻辑照样能验证。

---

## 五、待办（下次优先处理）

1. **L1 收尾作业**
   把 [02-react.mjs](s1-core/02-react.mjs) 里的 `chat` 换成
   [04-retry-timeout-cost.mjs](s1-core/04-retry-timeout-cost.mjs) 导出的升级版 `chat`，
   让 ReAct Agent 也获得超时重试与成本统计能力。

2. **L2 思考题（未答）**
   "Agent 怎么思考和行动？" 这个查询，BM25 给 ReAct 那篇打了 **15.45 分**，
   而 TF-IDF 的 cosine 只有 **0.75**。分数量级差这么多是为什么？
   提示：看 BM25 的 IDF 公式 `ln(1 + (N - df + 0.5) / (df + 0.5))`
   没有上界，而 cosine 被归一化到 [0, 1]，两者不可直接比较。

---

## 六、下一步计划（L2 后半程）

| 课 | 内容 |
|---|---|
| L2-3 | 真实 embedding 接入（OpenAI / 通义 / 智谱，取决于你有哪个 key） |
| L2-4 | 混合检索：BM25 + 向量，用 RRF（Reciprocal Rank Fusion）融合两路结果 |
| L2-5 | Rerank：召回后用交叉编码器重排，以及"为什么加了 Rerank 反而变差" |
| L2-6 | Chunking 策略：定长 / 按结构 / 父子块，各适合什么文档 |
| L2-7 | RAG 评估集：构造 query-答案对，量化召回率与忠实度 |

之后进 L3：LangGraph 编排、记忆与状态、FastAPI/SSE 服务化、Trace 可观测。

---

## 七、已经掌握的面试话术

这些是你现在就能讲出来的点，建议面试前再过一遍：

- **Agent 和普通调 API 的区别**：多了一个由 `tool_calls` 驱动的循环，以及循环里的状态管理。
- **模型为什么不直接执行工具**：模型只输出工具名和参数字符串，执行权在应用层。
- **工具报错为什么不能抛**：要把错误当作 observation 塞回 messages，让模型自我纠正；
  直接崩掉等于放弃了 Agent 的恢复能力。
- **参数校验失败为什么交还模型而不是自动修正**：自动转换会引入隐性 bug（`"八十"` 转不了数字），
  交还给模型更安全。
- **maxSteps 的作用**：不是让模型做完，而是防止无限烧 token。生产里通常 5–15。
- **重试策略**：只重试网络错误和 5xx/429，4xx 重试无意义；指数退避避免打爆下游。
- **BM25 的局限**：只看字面重合，不懂语义；"如何减少胡说八道" 搜不到 "降低幻觉"。
- **BM25 与 cosine 不可直接比大小**：前者无上界，后者归一化到 [0,1]。

---

## 八、下次续接提示词

开新对话时直接发这段：

```
继续我的 AI Agent 学习。先读 PROGRESS.md 和 s2-rag 下的代码，
我上次停在 L2-2（TF-IDF 向量检索），L1 的收尾作业和 L2 思考题还没做。
这次我们做 L2-3 真实 embedding 接入，我有 / 没有 embedding API key。
```

---

## 九、踩过的坑（备忘）

- **`.mjs` 与 ESM**：`import` 必须带扩展名 `./llm.mjs`，这是 Node ESM 的硬性要求。
- **忘写 `await`**：JS 里会拿到 `Promise { <pending> }`，然后 `.content` 是 `undefined`，报错很不直观。
- **`??` 与 `||` 的区别**：`??` 只在 `null/undefined` 时兜底，`||` 会把 `0` 和 `''` 也吞掉。
- **工具 schema 与函数参数必须同名**：写错不会报错，只会拿到 `undefined`（曾经把 `content` 写成 `note`）。
- **git push 认证**：本机 keychain 里没有 GitHub 凭据，首次 push 需要走弹窗登录；登录后会被记住。
