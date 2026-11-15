/**
 * L2 第 1 课：从零实现 BM25 检索。
 *
 * 运行：node 01-bm25-retrieval.mjs
 *
 * RAG 的第一步是检索。在拥抱 embedding 之前，先搞懂最经典的关键词检索 BM25。
 * 它的思想很简单：
 *   - 一个词在某篇文档里出现越多，这篇文档越相关（TF：词频）
 *   - 一个词在所有文档里越稀有，它的区分度越高（IDF：逆文档频率）
 *   - 文档太长会稀释词频，BM25 引入了文档长度归一化
 *
 * 这一课不依赖任何库，BM25 全部手写。
 */

// ==========================================================================
// 模拟的知识库：每个元素是一篇文档
// ==========================================================================

const DOCUMENTS = [
  'RAG 是检索增强生成，先检索再生成，用于降低大模型幻觉。',
  'ReAct 是一种 Agent 推理框架，交替进行思考和行动。',
  'Embedding 是把文本转换成向量，向量相似度可以衡量文本语义接近程度。',
  '向量数据库用于存储和检索高维向量，常见的有 Milvus、Qdrant、pgvector。',
  'BM25 是基于词频和逆文档频率的检索算法，是搜索引擎的核心。',
  '混合检索结合了 BM25 的关键词匹配和向量检索的语义匹配。',
  '大模型的幻觉是指它生成了看似合理但实际错误的内容。',
  'LangChain 是一个用于构建 LLM 应用的框架，提供了链、工具、记忆等抽象。',
];

// ==========================================================================
// 中文分词：简单按字切分 + 单字作为 token
// 真实项目里应该用 jieba / ik 等分词器，这里用单字切分足够演示 BM25
// ==========================================================================

function tokenize(text) {
  // 去掉标点和空白，按字切分
  return text
    .replace(/[，。、；：！？""''（）《》\s]/g, '')
    .split('')
    .filter((ch) => ch.trim() !== '');
}

// ==========================================================================
// BM25 核心实现
// ==========================================================================

class BM25 {
  /**
   * @param {string[]} documents 文档列表
   * @param {number} k1 词频饱和度参数，默认 1.2
   * @param {number} b 文档长度归一化参数，默认 0.75
   */
  constructor(documents, k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = documents;
    this.docTokens = documents.map(tokenize);
    this.avgDocLen =
      this.docTokens.reduce((sum, toks) => sum + toks.length, 0) / this.docTokens.length;
    this.idf = this._computeIdf();
  }

  // 计算每个词的 IDF
  _computeIdf() {
    const idf = {};
    const totalDocs = this.docTokens.length;
    const docFreq = {}; // 每个词出现在多少篇文档里

    for (const tokens of this.docTokens) {
      const seen = new Set(tokens);
      for (const token of seen) {
        docFreq[token] = (docFreq[token] ?? 0) + 1;
      }
    }

    for (const [token, df] of Object.entries(docFreq)) {
      // BM25 的 IDF 公式，加 1 防止除零
      idf[token] = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    }
    return idf;
  }

  /**
   * 对查询打分，返回按分数降序排列的 { doc, score, index }
   */
  search(query, topK = 3) {
    const queryTokens = tokenize(query);
    const scores = this.docTokens.map((docTokens, index) => {
      const docLen = docTokens.length;
      const tf = {};
      for (const token of docTokens) {
        tf[token] = (tf[token] ?? 0) + 1;
      }

      let score = 0;
      for (const token of queryTokens) {
        if (!tf[token]) continue;

        const freq = tf[token];
        const idf = this.idf[token] ?? 0;

        // BM25 核心公式
        const numerator = freq * (this.k1 + 1);
        const denominator =
          freq + this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLen);
        score += idf * (numerator / denominator);
      }

      return { doc: this.documents[index], score, index };
    });

    return scores
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ==========================================================================
// 演示
// ==========================================================================

const bm25 = new BM25(DOCUMENTS);

const queries = [
  '什么是 RAG？',
  '怎么降低幻觉？',
  '向量数据库有哪些？',
  'Agent 怎么思考和行动？',
];

console.log('='.repeat(70));
console.log('知识库文档：');
console.log('='.repeat(70));
DOCUMENTS.forEach((doc, i) => console.log(`${i + 1}. ${doc}`));

for (const query of queries) {
  console.log('\n' + '='.repeat(70));
  console.log(`查询：${query}`);
  console.log('='.repeat(70));

  const results = bm25.search(query, 3);
  if (results.length === 0) {
    console.log('没有匹配的文档');
    continue;
  }

  results.forEach((item, i) => {
    console.log(`  ${i + 1}. [score=${item.score.toFixed(4)}] ${item.doc}`);
  });
}

// ==========================================================================
// 思考题输出
// ==========================================================================

console.log('\n' + '='.repeat(70));
console.log('观察：');
console.log('='.repeat(70));
console.log('1. "什么是 RAG？" 命中了第 1 篇，因为"RAG"这个词的 IDF 很高（只出现在1篇里）');
console.log('2. "怎么降低幻觉？" 命中了第 1 篇和第 7 篇，两篇都提到了幻觉');
console.log('3. "Agent 怎么思考和行动？" 命中了第 2 篇（ReAct），虽然查询里没有"ReAct"这个词');
console.log('   但"思考"和"行动"这两个字匹配上了 —— 这是 BM25 的局限：它不懂语义');
