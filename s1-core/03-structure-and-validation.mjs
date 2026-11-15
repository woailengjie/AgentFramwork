/**
 * 第 3 课：结构化输出与参数校验。
 *
 * 运行：node 03-structure-and-validation.mjs
 *
 * 上一课里我们直接 JSON.parse(call.function.arguments)，
 * 这在真实环境下非常脆弱。这一课解决两个问题：
 *
 *   1. 模型返回的不一定是合法 JSON —— 可能包了代码块、带注释、被截断
 *   2. 即使 JSON 合法，字段类型也可能和 schema 对不上
 *
 * 这一课依然零依赖：手写一个 JSON 提取器 + 一个最小 schema 校验器。
 * 学完你就知道生产项目里为什么大家都用 zod / valibot 这类库。
 */

import { chat, MOCK } from './llm.mjs';

// ==========================================================================
// 1. 鲁棒的 JSON 提取：从模型返回的脏字符串里抠出合法 JSON
// ==========================================================================

/**
 * 从任意字符串里提取第一个合法 JSON。
 * 处理：代码块包裹、前后多余文字、单行注释。
 * 解析失败返回 null，由调用方决定怎么降级。
 */
function extractJson(raw) {
  if (!raw) return null;

  let text = raw.trim();

  // 去掉 ```json ... ``` 或 ``` ... ``` 包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // 去掉单行 // 注释（粗暴但够用，字符串里的 // 不会误伤因为 JSON 字符串用双引号）
  text = text.replace(/\/\/[^\n"]*/g, '');

  // 去掉 } 或 ] 前的尾逗号（注释被删后很容易留下这个）
  text = text.replace(/,(\s*[}\]])/g, '$1');

  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 直接解析失败，找最外层的 { 或 [ 开始截取
    const start = text.search(/[{[]/);
    if (start === -1) return null;

    // 从后往前找匹配的 } 或 ]，逐段缩短尝试
    for (let end = text.length; end > start; end -= 1) {
      const slice = text.slice(start, end);
      try {
        return JSON.parse(slice);
      } catch {
        // 继续缩短
      }
    }
    return null;
  }
}

// ==========================================================================
// 2. 最小 schema 校验器：按 JSON Schema 的子集校验参数
// ==========================================================================

// 支持的类型映射
const TYPE_CHECKERS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
};

/**
 * 校验 args 是否符合 schema。
 * 返回 { valid: boolean, errors: string[], cleaned: object }
 * cleaned 是把多余字段剔除、只保留 schema 里声明过的字段后的对象。
 */
function validateArgs(args, schema) {
  const errors = [];
  const cleaned = {};
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  // 检查必填
  for (const key of required) {
    if (!(key in args)) {
      errors.push(`缺少必填字段: ${key}`);
    }
  }

  // 检查类型 + 清洗
  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = properties[key];
    if (!fieldSchema) {
      // 多余字段直接忽略，不报错
      continue;
    }
    const check = TYPE_CHECKERS[fieldSchema.type];
    if (!check || !check(value)) {
      errors.push(`字段 ${key} 类型错误：期望 ${fieldSchema.type}，实际 ${typeof value}`);
    } else {
      cleaned[key] = value;
    }
  }

  return { valid: errors.length === 0, errors, cleaned };
}

// ==========================================================================
// 3. 工具 + Schema（和上一课一样，只保留三个够用了）
// ==========================================================================

const tools = {
  calculate: ({ expression }) => {
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('表达式只能包含数字和 + - * / ( )');
    }
    const value = new Function(`"use strict"; return (${expression});`)();
    return String(value);
  },
  get_weather: ({ city }) => {
    const data = { 北京: '晴，18 度', 上海: '多云，22 度' };
    return data[city] ?? `暂时没有 ${city} 的天气数据`;
  },
};

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行四则运算表达式。',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '四则运算表达式' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询城市天气。',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名' },
        },
        required: ['city'],
      },
    },
  },
];

// 工具名 -> schema 的快速查找表
const SCHEMA_BY_NAME = Object.fromEntries(
  TOOL_SCHEMAS.map((s) => [s.function.name, s.function.parameters]),
);

// ==========================================================================
// 4. Agent 循环（集成 JSON 提取 + 参数校验）
// ==========================================================================

async function runAgent(task, maxSteps = 6) {
  const messages = [
    { role: 'system', content: '你是可以调用工具的助手。' },
    { role: 'user', content: task },
  ];

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
      console.log(`[模型] 调用 ${name}，原始参数：${JSON.stringify(rawArgs)}`);

      // ---- 关键改动在这里 ----
      const parsed = extractJson(rawArgs);
      if (parsed === null) {
        const result = `参数不是合法 JSON：${rawArgs}`;
        console.log(`[校验失败] ${result}`);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        continue;
      }

      const { valid, errors, cleaned } = validateArgs(parsed, SCHEMA_BY_NAME[name] ?? {});
      if (!valid) {
        const result = `参数校验失败：${errors.join('；')}`;
        console.log(`[校验失败] ${result}`);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        continue;
      }
      // ---- 校验通过，用清洗后的参数执行 ----

      let result;
      try {
        const tool = tools[name];
        if (!tool) throw new Error(`工具 ${name} 不存在`);
        result = tool(cleaned);
      } catch (error) {
        result = `工具执行失败：${error.message}`;
      }
      console.log(`[工具] 返回 ${result}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
  }
  return '达到最大步数仍未收敛，需要人工介入';
}

// ==========================================================================
// 5. 自测：先验证 extractJson 和 validateArgs 本身对不对
// ==========================================================================

console.log('='.repeat(60));
console.log('自测 1：extractJson 能从脏字符串里抠出 JSON');
console.log('='.repeat(60));

const testCases = [
  '{"city": "上海"}',
  '```json\n{"city": "上海"}\n```',
  '好的，参数是 {"city": "上海"} 这样',
  '{"city": "上海", // 城市名\n}',
  '{"city": "上海", "extra": "这个字段会被剔除"}',
  '{city: "上海"}',  // 非法：key 没引号
];

for (const tc of testCases) {
  const result = extractJson(tc);
  console.log(`输入: ${tc}`);
  console.log(`输出: ${JSON.stringify(result)}`);
  console.log('---');
}

console.log('\n' + '='.repeat(60));
console.log('自测 2：validateArgs 按 schema 校验并清洗');
console.log('='.repeat(60));

const weatherSchema = SCHEMA_BY_NAME.get_weather;
console.log('schema:', JSON.stringify(weatherSchema));
console.log('---');

const argCases = [
  { city: '上海' },
  { city: 123 },                        // 类型错误
  {},                                   // 缺必填
  { city: '上海', extra: '多余字段' },   // 有多余字段
];

for (const args of argCases) {
  const { valid, errors, cleaned } = validateArgs(args, weatherSchema);
  console.log(`输入: ${JSON.stringify(args)}`);
  console.log(`valid=${valid} errors=${JSON.stringify(errors)} cleaned=${JSON.stringify(cleaned)}`);
  console.log('---');
}

// ==========================================================================
// 6. 跑一次完整 Agent
// ==========================================================================

console.log('\n' + '='.repeat(60));
console.log('模式:', MOCK ? 'mock' : '真实模型');
console.log('='.repeat(60));

const answer = await runAgent('帮我算 (18+22)*2，再查一下上海天气');
console.log(`\n最终回答：${answer}`);
