"""HTTP client for the dedicated model server.
Mirrors the query_llm / query_llm_stream / query_heavy_llm / query_heavy_llm_stream
signatures from ai_engine.py so existing code requires minimal changes.
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_BASE_DIR = Path(__file__).parent.parent

def _resolve_url() -> str:
    url = os.environ.get("MODEL_SERVER_URL", "")
    if url:
        return url.rstrip("/")

    config_file = _BASE_DIR / "config" / "ai.yaml"
    try:
        import yaml
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
            if cfg and cfg.get("model_server_url"):
                return cfg["model_server_url"].rstrip("/")
    except Exception:
        pass

    return "https://127.0.0.1:8081"


MODEL_SERVER_URL = _resolve_url()
HTTP_TIMEOUT = 120.0


async def query_llm(
    messages: List[dict],
    max_tokens: int = 512,
    temperature: float = 0.1,
) -> str:
    resp = await _chat_completion("light", messages, max_tokens, temperature, stream=False)
    return resp


async def query_llm_stream(
    messages: List[dict],
    max_tokens: int = 512,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    async for token in _chat_completion_stream("light", messages, max_tokens, temperature):
        yield token


async def query_heavy_llm(
    messages: List[dict],
    max_tokens: int = 512,
    temperature: float = 0.1,
) -> str:
    resp = await _chat_completion("heavy", messages, max_tokens, temperature, stream=False)
    return resp


async def query_heavy_llm_stream(
    messages: List[dict],
    max_tokens: int = 512,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    async for token in _chat_completion_stream("heavy", messages, max_tokens, temperature):
        yield token


async def health() -> dict:
    url = f"{MODEL_SERVER_URL}/health"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        return {"status": "error", "detail": "Model server unreachable"}
    except httpx.TimeoutException:
        return {"status": "error", "detail": "Model server timeout"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── Internal helpers ──────────────────────────────────────────────────

_last_health_check: float = 0
_health_cache: dict = {}


async def _check_health() -> dict:
    """Health check with 5-second cache to avoid hammering the server."""
    global _last_health_check, _health_cache
    now = time.monotonic()
    if now - _last_health_check < 5:
        return _health_cache
    _health_cache = await health()
    _last_health_check = now
    return _health_cache


async def _chat_completion(
    model: str,
    messages: list,
    max_tokens: int,
    temperature: float,
    stream: bool = False,
) -> str:
    url = f"{MODEL_SERVER_URL}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, verify=False) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise RuntimeError("Maaf, AI sedang tidak tersedia (server model tidak terhubung)")
    except httpx.TimeoutException:
        raise RuntimeError("Maaf, AI sedang tidak tersedia (server model timeout)")
    except httpx.HTTPStatusError as e:
        detail = f"AI model server error: {e.response.status_code}"
        try:
            detail += f" - {e.response.json().get('detail', '')}"
        except Exception:
            pass
        raise RuntimeError(f"Maaf, AI sedang tidak tersedia ({detail})")

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Maaf, AI tidak memberikan jawaban (respon kosong)")

    return choices[0].get("message", {}).get("content", "").strip()


async def _chat_completion_stream(
    model: str,
    messages: list,
    max_tokens: int,
    temperature: float,
) -> AsyncGenerator[str, None]:
    url = f"{MODEL_SERVER_URL}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, verify=False) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if "error" in data:
                            logger.warning("Model server SSE error: %s", data["error"])
                            yield f"({data['error']}) "
                            continue
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        logger.error("Model server unreachable at %s", MODEL_SERVER_URL)
        yield "Maaf, AI sedang tidak tersedia (server model tidak terhubung). "
    except httpx.TimeoutException:
        logger.error("Model server timeout after %ss", HTTP_TIMEOUT)
        yield "Maaf, AI sedang tidak tersedia (server model timeout). "
    except httpx.HTTPStatusError as e:
        logger.error("Model server HTTP %s", e.response.status_code)
        if e.response.status_code == 503:
            yield "Maaf, AI sedang tidak tersedia (model belum siap). "
        else:
            yield f"Maaf, AI sedang tidak tersedia (error {e.response.status_code}). "
    except Exception as e:
        logger.error("Stream request failed: %s", e, exc_info=True)
        yield "Maaf, ada gangguan teknis. Coba lagi ya. "
