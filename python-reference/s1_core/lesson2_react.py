"""第 2 课：不用任何框架，手写一个 ReAct Agent。

运行：python3 lesson2_react.py

一个 Agent 的全部秘密就是这个循环：
    调模型 → 模型说"我要用某工具" → 你执行 → 把结果塞回 messages → 再调模型
一直到模型不给 tool_calls 为止。

框架（LangChain / LangGraph）做的事情是把这个循环做得更稳、可观测、可编排，
但循环本身不会变。
"""

import ast
import json
import operator

from llm import MOCK, chat

# ==========================================================================
# 1. 工具：普通的 Python 函数。模型不能执行它们，只有你能执行。
# ==========================================================================

DOCS = {
    "rag": "RAG 是检索增强生成：先从知识库里检索相关片段，拼进 prompt，让模型基于这些片段作答，降低幻觉。",
    "react": "ReAct 是 Reasoning + Acting：模型交替输出思考与动作，执行动作拿到观察结果后继续思考。",
    "mcp": "MCP 是 Model Context Protocol：用统一协议把外部工具和数据源暴露给模型，避免每家各写一套。",
}


def search_docs(query: str) -> str:
    """本地假知识库检索。"""
    q = query.lower()
    hits = [v for k, v in DOCS.items() if k in q]
    return "\n".join(hits) if hits else "没有检索到相关内容"


_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}


def calculate(expression: str) -> str:
    """只允许四则运算的安全计算器。"""

    def _eval(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](_eval(node.left), _eval(node.right))
        raise ValueError("表达式里含有不允许的内容")

    return str(_eval(ast.parse(expression, mode="eval").body))


def get_weather(city: str) -> str:
    """假天气接口，真实项目里这里换成 HTTP 调用。"""
    data = {"北京": "晴，18 度", "上海": "多云，22 度", "深圳": "小雨，26 度"}
    return data.get(city, f"暂时没有 {city} 的天气数据")


TOOLS = {
    "search_docs": search_docs,
    "calculate": calculate,
    "get_weather": get_weather,
}

# ==========================================================================
# 2. 工具描述：模型只能看到这段 JSON Schema，它靠这个决定要不要调用
# ==========================================================================

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_docs",
            "description": "检索内部知识库，适合查询 RAG、ReAct、MCP 等概念的定义。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索关键词，例如 rag"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "执行四则运算表达式，例如 (18+22)*2。",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "只含数字和 + - * / ** 的表达式"},
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的当前天气。",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名，例如 上海"},
                },
                "required": ["city"],
            },
        },
    },
]

SYSTEM_PROMPT = (
    "你是一个可以调用工具的助手。"
    "涉及事实性问题时必须先调用工具获取信息，不要凭记忆编造。"
    "拿到工具结果后再用中文给出简洁结论。"
)

# ==========================================================================
# 3. Agent 循环
# ==========================================================================


def run_agent(task: str, max_steps: int = 6) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]

    for step in range(1, max_steps + 1):
        print(f"\n--- step {step} ---")
        msg = chat(messages, tools=TOOL_SCHEMAS)
        messages.append(msg)

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            print("[模型] 不再需要工具，结束循环")
            return msg.get("content", "")

        for call in tool_calls:
            name = call["function"]["name"]
            raw_args = call["function"].get("arguments") or "{}"
            print(f"[模型] 决定调用 {name}({raw_args})")

            try:
                args = json.loads(raw_args)
                result = TOOLS[name](**args)
            except KeyError:
                result = f"工具 {name} 不存在"
            except Exception as e:
                # 工具报错不要直接崩，把错误当成 observation 交还给模型
                result = f"工具执行失败：{e}"

            print(f"[工具] 返回 {result}")
            messages.append(
                {"role": "tool", "tool_call_id": call["id"], "content": str(result)}
            )

    return "达到最大步数仍未收敛，需要人工介入"


if __name__ == "__main__":
    print("=" * 60)
    print("模式:", "mock（未配置 API Key）" if MOCK else "真实模型")
    print("=" * 60)

    task = "RAG 和 ReAct 分别是什么？再帮我算一下 (18+22)*2，最后告诉我上海天气。"
    print(f"\n用户：{task}")
    answer = run_agent(task)
    print(f"\n最终回答：{answer}")
