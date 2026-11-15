/**
 * 第 1 课：一次模型调用到底发生了什么。
 *
 * 运行：node 01-chat.mjs
 *
 * 这里有两处 JS 语法你以后每天都会用到：
 *   - import { chat } from './llm.mjs'   ES Module 的具名导入
 *   - await chat(...)                    顶层 await（ESM 里可以直接用，不用包在函数里）
 */

import { chat, MOCK, MODEL } from './llm.mjs';

const messages = [
  // system：给模型设定角色和边界，在整轮对话里一直生效
  { role: 'system', content: '你是一名资深 Python 面试官，每次回答不超过 10 句话。' },
  // user：用户输入
  { role: 'user', content: '解释一下python这门编程领域在AI Agent中的作用。' },
];

console.log('='.repeat(60));
console.log('模式:', MOCK ? 'mock（未配置 API Key）' : `真实模型 ${MODEL}`);
console.log('='.repeat(60));

console.log('\n[1] 发出去的请求体：');
console.log(JSON.stringify({ messages }, null, 2));

const reply = await chat(messages);

console.log('\n[2] 模型返回的 message：');
console.log(JSON.stringify(reply, null, 2));

console.log('\n[3] 你真正要渲染给用户的内容：');
console.log(reply.content ?? '');
