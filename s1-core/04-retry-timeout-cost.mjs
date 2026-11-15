/**
 * 第 4 课：重试、超时与成本统计。
 *
 * 运行：node 04-retry-timeout-cost.mjs
 *
 * 前三课我们假设模型调用永远成功、永远不超时。
 * 真实环境里：
 *   - 网络会抖，需要重试 + 退避
 *   - 模型偶尔会卡住，需要超时
 *   - 每次调用都在烧钱，需要统计 token 和成本
 *
 * 这一课把 llm.mjs 里的 chat() 升级成一个"能上线"的版本。
 */

import { chat as rawChat, MOCK, MODEL, API_KEY } from './llm.mjs';

// ==========================================================================
// 1. 超时：用 Promise.race 给 fetch 套一个定时器
// ==========================================================================

/**
 * 带超时的 Promise。ms 内没完成就 reject。
 * 注意：超时只是放弃等待结果，底层请求可能还在跑（这是 fetch 的限制）。
 */
function withTimeout(promise, ms, label = '请求') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ==========================================================================
// 2. 重试 + 指数退避
// ==========================================================================

/**
 * 重试执行 fn，最多 maxRetries 次。
 * 指数退避：第 1 次等 1s，第 2 次等 2s，第 3 次等 4s...
 * 只有网络错误和 5xx 才重试；4xx（比如 key 错了）不重试，直接抛。
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 判断是否值得重试
      const status = error.status ?? error.cause?.status;
      const isRetryable =
        !status || // 网络错误没有 status
        status >= 500 ||
        status === 429; // 限流

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * 2 ** attempt;
      console.log(`[重试] 第 ${attempt + 1} 次失败：${error.message}，${delay}ms 后重试`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ==========================================================================
// 3. 成本统计
// ==========================================================================

// 常见模型的单价（美元 / 百万 token），用于估算成本。
// 真实项目里这些应该从配置读取，这里写死方便演示。
const MODEL_PRICING = {
  'deepseek-chat': { input: 1.0 / 1_000_000, output: 2.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
};

const costTracker = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  callCount: 0,
  totalCostUsd: 0,

  add(usage) {
    if (!usage) return;
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.callCount += 1;

    const pricing = MODEL_PRICING[MODEL] ?? { input: 0, output: 0 };
    const cost = inputTokens * pricing.input + outputTokens * pricing.output;
    this.totalCostUsd += cost;
  },

  reset() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.callCount = 0;
    this.totalCostUsd = 0;
  },

  summary() {
    return {
      model: MODEL,
      calls: this.callCount,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      costUsd: this.totalCostUsd.toFixed(6),
    };
  },
};

// ==========================================================================
// 4. 把三者组合成一个"生产级" chat 函数
// ==========================================================================

/**
 * 带超时、重试、成本统计的 chat。
 * 用法和原来的 chat 一样，只是多了两个可选参数。
 */
export async function chat(messages, options = {}) {
  const { tools, temperature = 0.2, timeoutMs = 60_000 } = options;

  const result = await withRetry(async () => {
    const response = await withTimeout(
      rawChat(messages, { tools, temperature }),
      timeoutMs,
      `模型调用`,
    );
    return response;
  });

  // 统计成本（mock 模式下没有 usage，跳过）
  if (!MOCK && result.usage) {
    costTracker.add(result.usage);
  }

  return result;
}

// ==========================================================================
// 5. 演示
// ==========================================================================

console.log('='.repeat(60));
console.log('模式:', MOCK ? 'mock（注意：mock 没有真实的超时/重试/成本）' : `真实模型 ${MODEL}`);
console.log('API Key 已配置:', !!API_KEY);
console.log('='.repeat(60));

const messages = [
  { role: 'system', content: '你是一个简洁的助手，回答不超过两句话。' },
  { role: 'user', content: '用一句话解释什么是 Agent。' },
];

costTracker.reset();
const reply = await chat(messages, { timeoutMs: 30_000 });
console.log('\n模型回答:', reply.content ?? '');

console.log('\n成本统计:', JSON.stringify(costTracker.summary(), null, 2));

// ==========================================================================
// 6. 演示超时和重试（mock 模式下我们手动模拟一个会失败的请求）
// ==========================================================================

console.log('\n' + '='.repeat(60));
console.log('演示：模拟网络错误下的重试');
console.log('='.repeat(60));

let failCount = 0;
const flakyCall = async () => {
  failCount += 1;
  if (failCount < 3) {
    const err = new Error('模拟网络错误 ECONNRESET');
    err.status = 500; // 标记为可重试
    throw err;
  }
  return { role: 'assistant', content: '第三次终于成功了' };
};

try {
  const result = await withRetry(flakyCall, 3, 200);
  console.log('最终结果:', result.content);
} catch (error) {
  console.log('最终失败:', error.message);
}
