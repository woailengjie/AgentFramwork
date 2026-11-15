/**
 * L2 第 2 课：TF-IDF 向量 + Cosine 相似度。
 *
 * 运行：node 02-tfidf-vector-search.mjs
 *
 * BM25 是"打分公式"，向量检索是另一套思路：
 *   把每篇文档变成一个向量（一串数字），查询也变成向量，
 *   然后算两个向量的夹角（cosine 相似度），夹角越小越相关。
 *
 * 真实的 embedding（比如 text-embedding-3）做的是同一件事，
 * 只是它的向量里编码了语义，而不是词频。
 * 这里先用 TF-IDF 把文档变成向量，让你看清向量检索是怎么算的。
 */

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

// 中文分词（和上一课一样，按字切分）
function tokenize(text) {
  return text
    .replace(/[，。、；：！？""''（）《》\s]/g, '')
    .split('')
    .filter((ch) => ch.trim() !== '');
}

// ==========================================================================
// 1. 构建词汇表（vocabulary）：所有文档里出现过的词
// ==========================================================================

function buildVocabulary(documents) {
  const vocab = new Set();
  for (const doc of documents) {
    for (const token of tokenize(doc)) {
      vocab.add(token);
    }
  }
  return Array.from(vocab);
}

// ==========================================================================
// 2. 计算 IDF（和 BM25 一样）
// ==========================================================================

function computeIdf(documents, vocab) {
  const totalDocs = documents.length;
  const idf = {};
  for (const word of vocab) {
    let df = 0;
    for (const doc of documents) {
      if (tokenize(doc).includes(word)) df += 1;
    }
    idf[word] = Math.log((totalDocs + 1) / (df + 1)) + 1; // smooth IDF
  }
  return idf;
}

// ==========================================================================
// 3. 把文本变成 TF-IDF 向量
//    向量的每一维对应词汇表里的一个词，值 = TF * IDF
// ==========================================================================

function toVector(text, vocab, idf) {
  const tokens = tokenize(text);
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] ?? 0) + 1;
  }
  const vector = new Float64Array(vocab.length);
  for (let i = 0; i < vocab.length; i += 1) {
    const word = vocab[i];
    const termFreq = tf[word] ?? 0;
    vector[i] = termFreq * (idf[word] ?? 0);
  }
  return vector;
}

// ==========================================================================
// 4. Cosine 相似度 = (A·B) / (|A| * |B|)
// ==========================================================================

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ==========================================================================
// 5. 检索：把查询向量化，和所有文档向量算 cosine，取 topK
// ==========================================================================

function search(query, docVectors, vocab, idf, topK = 3) {
  const queryVector = toVector(query, vocab, idf);
  const scores = docVectors.map((docVector, index) => ({
    doc: DOCUMENTS[index],
    score: cosineSimilarity(queryVector, docVector),
    index,
  }));
  return scores
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ==========================================================================
// 演示
// ==========================================================================

const vocab = buildVocabulary(DOCUMENTS);
const idf = computeIdf(DOCUMENTS, vocab);
const docVectors = DOCUMENTS.map((doc) => toVector(doc, vocab, idf));

console.log(`词汇表大小：${vocab.length}（每个文档变成 ${vocab.length} 维向量）`);
console.log(`第一篇文档的向量前 5 维：[${docVectors[0].slice(0, 5).map((v) => v.toFixed(4)).join(', ')}]`);

const queries = [
  '什么是 RAG？',
  '怎么降低幻觉？',
  '向量数据库有哪些？',
  'Agent 怎么思考和行动？',
  '如何减少模型胡说八道？', // 这个查询和"幻觉"字面上没有重叠
];

for (const query of queries) {
  console.log('\n' + '='.repeat(70));
  console.log(`查询：${query}`);
  console.log('='.repeat(70));

  const results = search(query, docVectors, vocab, idf, 3);
  if (results.length === 0) {
    console.log('没有匹配的文档');
    continue;
  }

  results.forEach((item, i) => {
    console.log(`  ${i + 1}. [cosine=${item.score.toFixed(4)}] ${item.doc}`);
  });
}

// ==========================================================================
// 和 BM25 对比
// ==========================================================================

console.log('\n' + '='.repeat(70));
console.log('关键观察：');
console.log('='.repeat(70));
console.log('1. "如何减少模型胡说八道？" 在 TF-IDF 下可能匹配度很低，因为没有共同的词');
console.log('   真实的 embedding 能理解"胡说八道"≈"幻觉"，这就是语义检索的价值');
console.log('2. cosine 相似度的范围是 [0, 1]，而 BM25 分数没有上界，两者不可直接比较');
console.log('3. 真实项目里的向量维度通常是 768 或 1536，而不是这里的词汇表大小');
