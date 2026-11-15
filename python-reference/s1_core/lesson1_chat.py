"""第 1 课：一次模型调用到底发生了什么。

运行：python3 lesson1_chat.py

重点不是"能让模型说话"，而是看清请求里的 messages 是个普通列表，
assistant 的回复也只是一条 message。整个 Agent 就是围绕这个列表做增删。
"""

import json

from llm import MOCK, MODEL, chat

messages = [
    # system：给模型设定角色和边界，在整轮对话里一直生效
    {"role": "system", "content": "你是一名资深 Python 面试官，每次回答不超过 3 句话。"},
    # user：用户输入
    {"role": "user", "content": "解释一下 Python 的 GIL，以及它对多线程的影响。"},
]

print("=" * 60)
print("模式:", "mock（未配置 API Key）" if MOCK else f"真实模型 {MODEL}")
print("=" * 60)
print("\n[1] 发出去的请求体：")
print(json.dumps({"messages": messages}, ensure_ascii=False, indent=2))

reply = chat(messages)

print("\n[2] 模型返回的 message：")
print(json.dumps(reply, ensure_ascii=False, indent=2))

print("\n[3] 你真正要渲染给用户的内容：")
print(reply.get("content", ""))
