"""LocalQwenChat — LangChain chat model di atas model-server lokal (Qwen GGUF).

Model-server tidak punya native function-calling, tapi Qwen2.5-Instruct terlatih tool-call gaya
Hermes. Kita emulasi: skema tool disuntik ke prompt, output `<tool_call>{...}</tool_call>` di-parse
jadi AIMessage.tool_calls. Kompatibel dengan langgraph.create_react_agent.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, List, Optional, Sequence

import httpx
from langchain_core.callbacks import CallbackManagerForLLMRun, AsyncCallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_tool

logger = logging.getLogger(__name__)

_TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)
_TOOL_OPEN_RE = re.compile(r"<tool_call>\s*(\{.*)", re.S)


def _first_json_object(s: str) -> Optional[str]:
    """Ambil objek JSON pertama yang kurung kurawalnya seimbang."""
    start = s.find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return s[start:i + 1]
    return None


def _tool_instructions(tool_schemas: List[dict]) -> str:
    if not tool_schemas:
        return ""
    lines = ["", "Anda punya TOOLS untuk mengambil data/pengetahuan super-apps. Untuk memakai data,"
             " Anda WAJIB memanggil tool — JANGAN menebak/mengarang angka atau hasil.",
             "Cara memanggil: keluarkan HANYA blok ini lalu BERHENTI (jangan menulis apa pun setelahnya):",
             '<tool_call>{"name": "<nama_tool>", "arguments": {<argumen>}}</tool_call>',
             "Sistem akan mengembalikan [HASIL TOOL ...]. Baru setelah itu Anda lanjut menalar atau"
             " memberi JAWABAN FINAL (tanpa tag tool, Bahasa Indonesia). DILARANG menulis '[HASIL TOOL]'"
             " sendiri.",
             "", "TOOLS:"]
    for t in tool_schemas:
        fn = t.get("function", t)
        name = fn.get("name")
        desc = (fn.get("description") or "").strip().replace("\n", " ")
        params = json.dumps(fn.get("parameters", {}).get("properties", {}), ensure_ascii=False)
        lines.append(f"- {name}: {desc} | argumen: {params}")
    return "\n".join(lines)


def _to_server_messages(messages: Sequence[BaseMessage], tool_prompt: str) -> List[dict]:
    out: List[dict] = []
    injected = False
    for m in messages:
        role = getattr(m, "type", "")
        content = m.content if isinstance(m.content, str) else str(m.content)
        if role == "system":
            if tool_prompt and not injected:
                content = content + "\n" + tool_prompt
                injected = True
            out.append({"role": "system", "content": content})
        elif role == "human":
            out.append({"role": "user", "content": content})
        elif role == "ai":
            tcs = getattr(m, "tool_calls", None) or []
            rendered = content or ""
            for tc in tcs:
                rendered += f'\n<tool_call>{json.dumps({"name": tc["name"], "arguments": tc.get("args", {})}, ensure_ascii=False)}</tool_call>'
            out.append({"role": "assistant", "content": rendered.strip() or "(memanggil tool)"})
        elif role == "tool":
            name = getattr(m, "name", "") or "tool"
            out.append({"role": "user", "content": f"[HASIL TOOL {name}]\n{content}"})
        else:
            out.append({"role": "user", "content": content})
    # bila belum ada system yang menampung tool_prompt, sisipkan di depan
    if tool_prompt and not injected:
        out.insert(0, {"role": "system", "content": tool_prompt})
    return out


def _parse_output(text: str):
    text = text or ""
    raws = _TOOL_CALL_RE.findall(text)
    clean = _TOOL_CALL_RE.sub("", text)
    if not raws:
        # Fallback: tag pembuka tanpa penutup, atau seluruh teks satu objek JSON tool
        m = _TOOL_OPEN_RE.search(text)
        candidate = m.group(1) if m else (text if text.strip().startswith("{") else "")
        js = _first_json_object(candidate) if candidate else None
        if js and '"name"' in js:
            raws = [js]
            clean = text[: text.find("<tool_call>")] if "<tool_call>" in text else ""
    calls = []
    for i, raw in enumerate(raws):
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if obj.get("name"):
            calls.append({"name": obj["name"], "args": obj.get("arguments") or {},
                          "id": f"call_{i}_{uuid.uuid4().hex[:8]}"})
    return clean.strip(), calls


class LocalQwenChat(BaseChatModel):
    """Chat model tool-calling di atas model-server lokal."""

    model: str = "heavy"
    temperature: float = 0.1
    max_tokens: int = 640
    tool_schemas: List[dict] = []

    @property
    def _llm_type(self) -> str:
        return "local-qwen-chat"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any):
        schemas = [convert_to_openai_tool(t) for t in tools]
        return self.__class__(model=self.model, temperature=self.temperature,
                              max_tokens=self.max_tokens, tool_schemas=schemas)

    def _build(self, messages: Sequence[BaseMessage]):
        tool_prompt = _tool_instructions(self.tool_schemas)
        return _to_server_messages(messages, tool_prompt)

    def _make_result(self, text: str) -> ChatResult:
        clean, calls = _parse_output(text)
        msg = AIMessage(content=clean, tool_calls=calls)
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def _generate(self, messages: List[BaseMessage], stop: Optional[List[str]] = None,
                  run_manager: Optional[CallbackManagerForLLMRun] = None, **kwargs: Any) -> ChatResult:
        from utils.ai_model_client import _resolve_url
        payload = {"model": self.model, "messages": self._build(messages),
                   "max_tokens": self.max_tokens, "temperature": self.temperature, "stream": False}
        with httpx.Client(timeout=180.0, verify=False) as c:
            r = c.post(_resolve_url().rstrip("/") + "/v1/chat/completions", json=payload)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
        return self._make_result(text)

    async def _agenerate(self, messages: List[BaseMessage], stop: Optional[List[str]] = None,
                         run_manager: Optional[AsyncCallbackManagerForLLMRun] = None, **kwargs: Any) -> ChatResult:
        from utils.ai_model_client import _chat_completion
        # Berhenti tepat setelah tool-call agar model tak mengarang hasil tool.
        stops = ["</tool_call>", "[HASIL TOOL", "HASIL TOOL:"] + (stop or [])
        text = await _chat_completion(self.model, self._build(messages), self.max_tokens,
                                      self.temperature, stop=stops)
        return self._make_result(text)
