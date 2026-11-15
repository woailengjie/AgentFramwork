"""最小 LLM 客户端。

这一课刻意不用 openai SDK、不用 LangChain：
一次模型调用 = 一次 HTTP POST，body 里就是 messages 列表。
把这一层看透，后面所有框架都只是在这层外面套壳。

配置写在同目录的 .env 里，没有 key 时自动进入 mock 模式，
保证你随时可以把代码跑起来。
"""

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def _load_env() -> None:
    """读同目录 .env，避免为了一个配置项装 python-dotenv。"""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env()

API_KEY = os.environ.get("LLM_API_KEY", "")
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")

MOCK = not API_KEY


def chat(messages: list, tools: list = None, temperature: float = 0.2) -> dict:
    """调一次模型，返回 assistant 消息（含可能的 tool_calls）。

    返回结构和 OpenAI / DeepSeek 的 message 完全一致：
        {"role": "assistant", "content": "...", "tool_calls": [...]}
    """
    if MOCK:
        return _mock_reply(messages, tools)

    payload = {"model": MODEL, "messages": messages, "temperature": temperature}
    if tools:
        payload["tools"] = tools

    req = urllib.request.Request(
        url=f"{BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"模型调用失败 {e.code}: {e.read().decode('utf-8', 'ignore')}") from e

    return data["choices"][0]["message"]


# --------------------------------------------------------------------------
# mock：没有 API Key 时的本地假模型，用来验证 Agent 循环本身是否写对
# --------------------------------------------------------------------------

_mock_counter = {"n": 0}


def _mock_reply(messages: list, tools: list) -> dict:
    last = messages[-1]

    if last.get("role") == "tool":
        return {
            "role": "assistant",
            "content": f"[mock] 工具返回了：{last.get('content')}。基于这个结果给出最终答案。",
        }

    if not tools:
        return {"role": "assistant", "content": "[mock] 收到你的问题，这是一次不带工具的普通回答。"}

    tool = tools[0]["function"]
    params = tool.get("parameters", {}).get("properties", {})
    args = {k: "示例输入" for k in params}
    _mock_counter["n"] += 1
    return {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": f"mock_{_mock_counter['n']}",
                "type": "function",
                "function": {"name": tool["name"], "arguments": json.dumps(args, ensure_ascii=False)},
            }
        ],
    }
