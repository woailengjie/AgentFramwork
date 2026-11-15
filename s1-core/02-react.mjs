/**
 * 第 2 课：不用任何框架，手写一个 ReAct Agent（JavaScript 版）。
 *
 * 运行：node 02-react.mjs
 *
 * 循环本身和 Python 版一模一样：
 *   调模型 -> 模型说"我要用某工具" -> 你执行 -> 把结果塞回 messages -> 再调模型
 * 变化只在于 JS 是异步的：每一步都要 await。
 */

import { chat, MOCK } from './llm.mjs';

// ==========================================================================
// 1. 工具：普通的 JS 函数。模型不能执行它们，只有你能执行。
//
// 和 Python 版对照：
//   Python: def search_docs(query: str)     调用 search_docs(**args)
//   JS:     function searchDocs({ query })  调用 fn(args)
// JS 习惯让函数只收一个对象，参数名和 JSON Schema 里的字段一一对应。
// ==========================================================================

const DOCS = {
  rag: 'RAG 是检索增强生成：先从知识库里检索相关片段，拼进 prompt，让模型基于这些片段作答，降低幻觉。',
  react: 'ReAct 是 Reasoning + Acting：模型交替输出思考与动作，执行动作拿到观察结果后继续思考。',
  mcp: 'MCP 是 Model Context Protocol：用统一协议把外部工具和数据源暴露给模型，避免每家各写一套。',
};

// save_note 的存储，放在 tools 之前是因为函数里要用到它
const savedNotes = [];

const tools = {
  search_docs: ({ query }) => {
    const q = query.toLowerCase();
    const hits = Object.entries(DOCS)
      .filter(([keyword]) => q.includes(keyword))
      .map(([, text]) => text);
    return hits.length > 0 ? hits.join('\n') : '没有检索到相关内容';
  },

  calculate: ({ expression }) => {
    // 先把表达式限制在数字和四则运算符，再交给 Function 求值
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('表达式只能包含数字和 + - * / ( )');
    }
    const value = new Function(`"use strict"; return (${expression});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('计算结果不是有效数字');
    }
    return String(value);
  },

  get_weather: ({ city }) => {
    const data = { 北京: '晴，18 度', 上海: '多云，22 度', 深圳: '小雨，26 度' };
    return data[city] ?? `暂时没有 ${city} 的天气数据`;
  },

  save_note: ({ content }) => {
    // 简单起见存到内存数组里，真实项目里可以写文件或数据库
    savedNotes.push(content);
    return `已保存第 ${savedNotes.length} 条笔记：${content}`;
  },
};

// ==========================================================================
// 2. 工具描述：模型只能看到这段 JSON Schema，它靠这个决定要不要调用
// ==========================================================================

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_docs',
      description: '检索内部知识库，适合查询 RAG、ReAct、MCP 等概念的定义。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词，例如 rag' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行四则运算表达式，例如 (18+22)*2。',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '只含数字和 + - * / ** 的表达式' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气。',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，例如 上海' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: '保存一个笔记。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '笔记内容' },
        },
        required: ['content'],
      },
    },
  },
];

const SYSTEM_PROMPT =
  '你是一个可以调用工具的助手。' +
  '涉及事实性问题时必须先调用工具获取信息，不要凭记忆编造。' +
  '拿到工具结果后再用中文给出简洁结论。';

// ==========================================================================
// 3. Agent 循环
// ==========================================================================

async function runAgent(task, maxSteps = 6) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];

  // 记录上一次工具调用的指纹，用来检测"连续两次相同调用"的死循环
  let lastCallSig = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    console.log(`\n--- step ${step} ---`);

    const message = await chat(messages, { tools: TOOL_SCHEMAS });
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      console.log('[模型] 不再需要工具，结束循环');
      return message.content ?? '';
    }

    for (const call of toolCalls) {
      const name = call.function.name;
      const rawArgs = call.function.arguments || '{}';
      console.log(`[模型] 决定调用 ${name}(${rawArgs})`);

      // 指纹 = 工具名 + 排序后的参数 JSON
      // 目的：{"a":1,"b":2} 和 {"b":2,"a":1} 被视为同一个调用
      let sig;
      try {
        const args = JSON.parse(rawArgs);
        sig = `${name}:${JSON.stringify(args, Object.keys(args).sort())}`;
      } catch {
        sig = `${name}:${rawArgs}`;
      }

      let result;
      if (sig === lastCallSig) {
        // 连续两次相同调用：不真正执行，把警告作为 observation 还给模型
        result = `检测到你刚刚已经用相同参数调用过 ${name}，这次没有重复执行。请换一个工具或修改参数，或者直接基于已有结果给出答案。`;
        console.log('[拦截] 重复调用，已跳过执行');
      } else {
        try {
          const args = JSON.parse(rawArgs);
          const tool = tools[name];
          if (!tool) throw new Error(`工具 ${name} 不存在`);
          result = tool(args);
        } catch (error) {
          // 工具报错不要直接崩，把错误当成 observation 交还给模型
          result = `工具执行失败：${error.message}`;
        }
      }

      lastCallSig = sig;
      console.log(`[工具] 返回 ${result}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
  }

  return '达到最大步数仍未收敛，需要人工介入';
}

console.log('='.repeat(60));
console.log('模式:', MOCK ? 'mock（未配置 API Key）' : '真实模型');
console.log('='.repeat(60));

const task = 'RAG 和 ReAct 分别是什么？再帮我算一下 (18+22)*2，最后告诉我上海天气，然后把结论存成一条笔记。';
console.log(`\n用户：${task}`);

const answer = await runAgent(task, 2);
console.log(`\n最终回答：${answer}`);
