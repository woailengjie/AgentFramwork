/**
 * 最小 LLM 客户端（JavaScript 版）。
 *
 * 和 Python 版一样，故意不用任何 npm 包：
 * 一次模型调用 = 一次 fetch POST，body 里就是 messages 数组。
 * Node 18+ 自带 fetch，所以这个文件零依赖。
 *
 * 写法和 Python 最大的不同：
 *   - Python 的 chat(messages, tools=None) 用关键字参数
 *   - JS 只有一个参数位，所以多参数统一打包成 options 对象：chat(messages, { tools })
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// 读同目录 .env。Node 20.6+ 其实有 --env-file 参数，这里手写是为了让过程可见。
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    const text = readFileSync(new URL('./.env', import.meta.url), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // 没有 .env 文件就跳过，后面会自动进 mock 模式
  }
}

loadEnv();

export const API_KEY = process.env.LLM_API_KEY ?? 'sk-1b32deb54fd4444a8ac85427dd7f3884';
export const BASE_URL = (process.env.LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
export const MODEL = process.env.LLM_MODEL ?? 'deepseek-flash';
export const MOCK = !API_KEY;

/**
 * 调一次模型，返回 assistant 消息（可能带 tool_calls）。
 *
 * @param {Array<{role: string, content: string, tool_calls?: Array, tool_call_id?: string}>} messages
 * @param {{tools?: Array, temperature?: number}} [options]
 * @returns {Promise<{role: string, content?: string, tool_calls?: Array}>}
 */
export async function chat(messages, options = {}) {
  const { tools, temperature = 0.2 } = options;

  if (MOCK) return mockReply(messages, tools);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      ...(tools ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型调用失败 ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;
  // 把 token 用量挂到 message 上，方便上层统计成本
  if (data.usage) message.usage = data.usage;
  return message;
}

// ---------------------------------------------------------------------------
// mock：没有 API Key 时的本地假模型，用来验证 Agent 循环本身是否写对
// ---------------------------------------------------------------------------

let mockCounter = 0;

function mockReply(messages, tools) {
  const last = messages.at(-1);

  if (last.role === 'tool') {
    return {
      role: 'assistant',
      content: `[mock] 工具返回了：${last.content}。基于这个结果给出最终答案。`,
    };
  }

  if (!tools) {
    return { role: 'assistant', content: '[mock] 收到你的问题，这是一次不带工具的普通回答。' };
  }

  const tool = tools[0].function;
  const args = {};
  for (const key of Object.keys(tool.parameters?.properties ?? {})) {
    args[key] = '示例输入';
  }

  mockCounter += 1;
  return {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: `mock_${mockCounter}`,
        type: 'function',
        function: { name: tool.name, arguments: JSON.stringify(args) },
      },
    ],
  };
}
