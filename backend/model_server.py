"""Dedicated model server for AI inference.
Loads light (1.5B) and heavy (7B) Llama models and serves them
via OpenAI-compatible API on port 8081. All workers call this server
via HTTP instead of loading models in-process.
"""
import asyncio
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import numpy as np

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse

logger = logging.getLogger("model_server")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(title="Super Apps Model Server")

_BASE_DIR = Path(__file__).parent

# ── Auth middleware ─────────────────────────────────────────────────────
MODEL_SERVER_API_KEY = os.environ.get("MODEL_SERVER_API_KEY", "")

@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    """Require X-API-Key header for all endpoints except /health."""
    if request.url.path == "/health":
        return await call_next(request)
    
    if not MODEL_SERVER_API_KEY:
        logger.warning("MODEL_SERVER_API_KEY not set - rejecting all requests")
        return JSONResponse(status_code=503, content={"detail": "Model server not configured"})
    
    provided_key = request.headers.get("X-API-Key", "")
    if provided_key != MODEL_SERVER_API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    
    return await call_next(request)

# ── Default config (overridden by ai.yaml) ────────────────────────────
MODEL_PATH = _BASE_DIR / "data" / "ai" / "qwen2.5-1.5b-instruct-q4_k_m.gguf"
HEAVY_MODEL_PATH = _BASE_DIR / "data" / "ai" / "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf"
MAX_INPUT_TOKENS = 4096
MAX_OUTPUT_TOKENS = 512

LABELS = {
    "light": {
        "path": MODEL_PATH,
        "loaded": False,
        "instance": None,
        "lock": None,
        "semaphore_count": 4,
    },
    "heavy": {
        "path": HEAVY_MODEL_PATH,
        "loaded": False,
        "instance": None,
        "lock": None,
        "semaphore_count": 1,
    },
}

_executor = ThreadPoolExecutor(max_workers=6)
_start_time = time.monotonic()
_last_inference_time = 0.0
_HEAVY_LAST_USE = 0.0

# ── Embedder config ──────────────────────────────────────────
EMBEDDER_MODEL_PATH = _BASE_DIR / "data" / "ai" / "embedder" / "paraphrase-multilingual-MiniLM-L12-v2"
_EMBEDDER_INSTANCE = None

INFLIGHT_MAP: Dict[str, dict] = {}
_inflight_lock = asyncio.Lock()


def _load_config():
    config_file = _BASE_DIR / "config" / "ai.yaml"
    try:
        import yaml
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
    except Exception:
        return

    global MODEL_PATH, HEAVY_MODEL_PATH, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, EMBEDDER_MODEL_PATH
    if cfg.get("model_path"):
        MODEL_PATH = _BASE_DIR / cfg["model_path"]
        LABELS["light"]["path"] = MODEL_PATH
    if cfg.get("heavy_model_path"):
        HEAVY_MODEL_PATH = _BASE_DIR / cfg["heavy_model_path"]
        LABELS["heavy"]["path"] = HEAVY_MODEL_PATH
    if cfg.get("embedder_model_path"):
        EMBEDDER_MODEL_PATH = _BASE_DIR / cfg["embedder_model_path"]
    if cfg.get("max_input_tokens"):
        MAX_INPUT_TOKENS = int(cfg["max_input_tokens"])
    if cfg.get("max_output_tokens"):
        MAX_OUTPUT_TOKENS = int(cfg["max_output_tokens"])


_load_config()


# ── Model loading ─────────────────────────────────────────────────────

def _load_model_instance(label: str):
    info = LABELS[label]
    if info["instance"] is not None:
        return

    model_path = info["path"]
    if not model_path.exists():
        logger.warning("Model %s not found at %s", label, model_path)
        return

    logger.info("Loading %s model %s ...", label, model_path.name)
    from llama_cpp import Llama
    try:
        kwargs = dict(
            model_path=str(model_path),
            n_ctx=4096,
            n_threads=4,
            n_gpu_layers=0,
            verbose=False,
        )
        if label == "heavy":
            kwargs["flash_attn"] = True
            kwargs["use_mlock"] = True
        info["instance"] = Llama(**kwargs)
        info["loaded"] = True
        logger.info("%s model loaded: %s", label.capitalize(), model_path.name)
    except Exception as e:
        info["instance"] = None
        info["loaded"] = False
        logger.error("Failed to load %s model: %s", label, e, exc_info=True)


def _load_light():
    _load_model_instance("light")


def _load_heavy():
    _load_model_instance("heavy")


def _load_embedder():
    global _EMBEDDER_INSTANCE
    if _EMBEDDER_INSTANCE is not None:
        return
    if not EMBEDDER_MODEL_PATH.is_dir():
        logger.warning("Embedder model not found at %s", EMBEDDER_MODEL_PATH)
        return
    logger.info("Loading embedder model %s ...", EMBEDDER_MODEL_PATH.name)
    from sentence_transformers import SentenceTransformer
    try:
        _EMBEDDER_INSTANCE = SentenceTransformer(str(EMBEDDER_MODEL_PATH))
        logger.info("Embedder model loaded: %s", EMBEDDER_MODEL_PATH.name)
    except Exception as e:
        _EMBEDDER_INSTANCE = None
        logger.error("Failed to load embedder: %s", e, exc_info=True)


# ── On-demand heavy loading + idle unloader ─────────────────────────

async def _ensure_heavy_loaded():
    info = LABELS["heavy"]
    if info["loaded"] and info["instance"] is not None:
        return
    logger.info("Heavy model not loaded, loading on-demand...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, _load_heavy)
    if not info["loaded"] or info["instance"] is None:
        raise HTTPException(status_code=503, detail="Failed to load heavy model")
    logger.info("Heavy model loaded on-demand")


async def _heavy_idle_watchdog():
    while True:
        await asyncio.sleep(60)
        info = LABELS["heavy"]
        if not info["loaded"] or info["instance"] is None:
            continue
        elapsed = time.monotonic() - _HEAVY_LAST_USE
        if elapsed > 600:
            logger.info("Heavy model idle for %.0fs, unloading...", elapsed)
            info["instance"] = None
            info["loaded"] = False


# ── Inference ─────────────────────────────────────────────────────────

def _do_inference(model, messages, max_tokens, temperature):
    global _last_inference_time
    _last_inference_time = time.monotonic()
    start = _last_inference_time
    try:
        result = model.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=["<|im_end|>", "<|end|>"],
        )
        elapsed = time.monotonic() - start
        usage = result.get("usage", {})
        pt = usage.get("prompt_tokens", 0)
        ct = usage.get("completion_tokens", 0)
        logger.debug("Inference: prompt=%d completion=%d latency=%.2fs", pt, ct, elapsed)
        content = result["choices"][0]["message"]["content"].strip()
        return content, {
            "latency_ms": round(elapsed * 1000),
            "prompt_tokens": pt,
            "completion_tokens": ct,
        }
    except Exception as e:
        elapsed = time.monotonic() - start
        logger.error("Inference failed: %s", e, exc_info=True)
        raise


async def _infer(
    label: str,
    messages: List[dict],
    max_tokens: int,
    temperature: float,
) -> tuple[str, dict]:
    info = LABELS.get(label)
    if info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {label}")

    if label == "heavy":
        global _HEAVY_LAST_USE
        await _ensure_heavy_loaded()
        _HEAVY_LAST_USE = time.monotonic()

    if not info["loaded"] or info["instance"] is None:
        raise HTTPException(status_code=503, detail=f"Model '{label}' not loaded")

    instance = info["instance"]
    sem = info["lock"]
    if sem is None:
        raise HTTPException(status_code=503, detail=f"Model '{label}' lock not initialized")

    async with sem:
        content, meta = await asyncio.get_event_loop().run_in_executor(
            _executor, _do_inference, instance, messages, max_tokens, temperature,
        )
    return content, meta


def _stream_inference(model, messages, max_tokens, temperature):
    stream = model.create_chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stop=["<|im_end|>", "<|end|>"],
        stream=True,
    )
    for chunk in stream:
        delta = chunk["choices"][0]["delta"]
        if "content" in delta:
            yield delta["content"]


async def _infer_stream(
    label: str,
    messages: List[dict],
    max_tokens: int,
    temperature: float,
) -> AsyncGenerator[str, None]:
    info = LABELS.get(label)
    if info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {label}")

    if label == "heavy":
        global _HEAVY_LAST_USE
        await _ensure_heavy_loaded()
        _HEAVY_LAST_USE = time.monotonic()

    if not info["loaded"] or info["instance"] is None:
        raise HTTPException(status_code=503, detail=f"Model '{label}' not loaded")

    instance = info["instance"]
    sem = info["lock"]
    if sem is None:
        raise HTTPException(status_code=503, detail=f"Model '{label}' lock not initialized")

    loop = asyncio.get_event_loop()
    queue = asyncio.Queue()

    def produce():
        try:
            for token in _stream_inference(instance, messages, max_tokens, temperature):
                loop.call_soon_threadsafe(queue.put_nowait, token)
        except Exception as e:
            logger.error("Stream inference failed for %s: %s", label, e, exc_info=True)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    async with sem:
        loop.run_in_executor(_executor, produce)
        while True:
            token = await queue.get()
            if token is None:
                break
            yield token


# ── API Endpoints ─────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("Model Server starting on port %s", os.environ.get("MODEL_SERVER_PORT", "8081"))
    logger.info("Light model: %s", LABELS["light"]["path"])
    logger.info("Heavy model: %s", LABELS["heavy"]["path"])

    LABELS["light"]["lock"] = asyncio.Semaphore(LABELS["light"]["semaphore_count"])
    LABELS["heavy"]["lock"] = asyncio.Semaphore(LABELS["heavy"]["semaphore_count"])

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _load_light)

    asyncio.ensure_future(_heavy_idle_watchdog())

    loop.run_in_executor(None, _load_embedder)

    logger.info("Model loading initiated (light auto-loaded, embedder auto-loaded, heavy on-demand)")


@app.get("/health")
async def health():
    light_info = LABELS["light"]
    heavy_info = LABELS["heavy"]

    light_loaded = light_info["loaded"] and light_info["instance"] is not None
    heavy_loaded = heavy_info["loaded"] and heavy_info["instance"] is not None

    return {
        "status": "ok" if light_loaded else "starting",
        "light_loaded": light_loaded,
        "heavy_loaded": heavy_loaded,
        "uptime_seconds": round(time.monotonic() - _start_time),
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    model = body.get("model", "light")
    messages = body.get("messages", [])
    max_tokens = body.get("max_tokens", MAX_OUTPUT_TOKENS)
    temperature = body.get("temperature", 0.1)
    stream = body.get("stream", False)

    if not messages:
        raise HTTPException(status_code=400, detail="messages is required")

    if stream:
        async def event_generator():
            full_content = ""
            try:
                async for token in _infer_stream(model, messages, max_tokens, temperature):
                    full_content += token
                    data = json.dumps({"choices": [{"delta": {"content": token}}]})
                    yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"
            except HTTPException as e:
                data = json.dumps({"error": e.detail})
                yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error("Stream error: %s", e, exc_info=True)
                data = json.dumps({"error": "Internal server error"})
                yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        content, meta = await _infer(model, messages, max_tokens, temperature)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat completion error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": meta,
        "model": model,
    }


@app.post("/v1/embeddings")
async def embeddings(request: Request):
    global _EMBEDDER_INSTANCE
    if _EMBEDDER_INSTANCE is None:
        raise HTTPException(status_code=503, detail="Embedder not loaded")

    body = await request.json()
    input_data = body.get("input", "")

    if isinstance(input_data, str):
        texts = [input_data]
    elif isinstance(input_data, list):
        texts = input_data
    else:
        raise HTTPException(status_code=400, detail="input must be string or array")

    if not texts:
        raise HTTPException(status_code=400, detail="input is empty")

    loop = asyncio.get_event_loop()
    try:
        embeddings_result = await loop.run_in_executor(
            _executor,
            lambda: _EMBEDDER_INSTANCE.encode(texts, normalize_embeddings=True),
        )
        embedding_list = np.asarray(embeddings_result).tolist()
    except Exception as e:
        logger.error("Embedding failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Embedding failed")

    return {
        "object": "list",
        "data": [
            {"object": "embedding", "index": i, "embedding": emb}
            for i, emb in enumerate(embedding_list)
        ],
        "model": EMBEDDER_MODEL_PATH.stem,
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
    }


if __name__ == "__main__":
    port = int(os.environ.get("MODEL_SERVER_PORT", "8081"))
    use_ssl = os.environ.get("MODEL_SERVER_SSL", "false").lower() == "true"
    cert_file = os.environ.get("SSL_CERTFILE", "")
    key_file = os.environ.get("SSL_KEYFILE", "")

    ssl_kwargs = {}
    if use_ssl and cert_file and key_file:
        ssl_kwargs["ssl_certfile"] = cert_file
        ssl_kwargs["ssl_keyfile"] = key_file

    logger.info("Starting on port %d (SSL: %s)", port, use_ssl)
    uvicorn.run(
        "model_server:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        **ssl_kwargs,
    )
