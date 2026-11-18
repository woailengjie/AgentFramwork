# AgentFramwork · AI Agent 应用开发学习仓库

从零手写 Agent 内核与 RAG 全链路的学习代码，全部零依赖、可直接 `node` 运行。

- 学习路线：[ROADMAP.md](ROADMAP.md)
- 当前进度与续接说明：[PROGRESS.md](PROGRESS.md)

---

## 下次续接提示词

开新对话时直接发这段：

```
继续我的 AI Agent 学习。先读 PROGRESS.md 和 s2-rag 下的代码，
我上次停在 L2-2（TF-IDF 向量检索），L1 的收尾作业和 L2 思考题还没做。
这次我们做 L2-3 真实 embedding 接入，我有 / 没有 embedding API key。
```

---

## 目录结构

```
s1-core/            L1 Agent 内核：LLM 调用、手写 ReAct、结构化输出与校验、重试超时成本
s2-rag/             L2 RAG：BM25 检索、TF-IDF 向量检索
python-reference/   最早的 Python 版实现，仅作语法对照
```

## 运行

```bash
node s1-core/01-chat.mjs
node s1-core/02-react.mjs
node s2-rag/01-bm25-retrieval.mjs
```

未配置 `s1-core/.env` 时自动进入 mock 模式，逻辑照样可验证。
