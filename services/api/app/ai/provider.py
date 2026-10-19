"""Camada de provedores de IA. O produto não depende de um fornecedor: cada tarefa usa o modelo
configurado no painel, do Claude (Anthropic) ou da DeepSeek (bem mais barata, usada nas traduções).
"fake" é só para testes e desenvolvimento sem chave, e responde com um texto marcado como teste."""

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import get_settings
from app.services import secrets


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


@dataclass
class Completion:
    """Resultado final de uma chamada (preenchido ao fim do streaming)."""

    model: str
    text: str = ""
    usage: Usage = field(default_factory=Usage)
    stop_reason: str | None = None
    request_id: str | None = None
    latency_ms: int = 0


class ProviderError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class AIProvider(Protocol):
    name: str

    def stream(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict],
        effort: str,
        max_tokens: int,
        result: Completion,
    ) -> AsyncIterator[str]:
        """Gera os trechos de texto e preenche `result` ao terminar."""
        ...

    async def complete(
        self, *, model: str, system: str, prompt: str, effort: str, max_tokens: int
    ) -> Completion: ...

    async def complete_json(
        self, *, model: str, system: str, prompt: str, schema: dict, effort: str, max_tokens: int
    ) -> tuple[dict, Completion]: ...


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str | None) -> None:
        import anthropic

        self._anthropic = anthropic
        self.api_key = api_key
        # A chave vem do painel do admin ou de ANTHROPIC_API_KEY; nunca chega ao app
        self.client = anthropic.AsyncAnthropic(api_key=api_key or "missing", max_retries=2, timeout=180.0)

    @staticmethod
    def _usage(raw) -> Usage:
        return Usage(
            input_tokens=raw.input_tokens or 0,
            output_tokens=raw.output_tokens or 0,
            cache_read_tokens=getattr(raw, "cache_read_input_tokens", 0) or 0,
            cache_write_tokens=getattr(raw, "cache_creation_input_tokens", 0) or 0,
        )

    def _translate_error(self, e: Exception) -> ProviderError:
        a = self._anthropic
        if isinstance(e, a.RateLimitError):
            return ProviderError("provider_rate_limited", str(e))
        if isinstance(e, a.AuthenticationError | a.PermissionDeniedError):
            return ProviderError("provider_auth", str(e))
        if isinstance(e, a.BadRequestError):
            return ProviderError("provider_bad_request", str(e))
        if isinstance(e, a.APIStatusError):
            return ProviderError("provider_unavailable", str(e))
        if isinstance(e, a.APIConnectionError):
            return ProviderError("provider_connection", str(e))
        return ProviderError("provider_error", str(e))

    async def stream(self, *, model, system, messages, effort, max_tokens, result):
        start = time.monotonic()
        try:
            async with self.client.beta.messages.stream(
                model=model,
                max_tokens=max_tokens,
                # Instruções fixas em cache: a leitura de cache custa uma fração do preço de entrada
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=messages,
                output_config={"effort": effort},
                # Se o modelo recusar por política de segurança, o servidor tenta o modelo reserva
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                final = await stream.get_final_message()
        except self._anthropic.APIError as e:
            raise self._translate_error(e) from e
        result.model = final.model
        result.text = "".join(b.text for b in final.content if b.type == "text")
        result.usage = self._usage(final.usage)
        result.stop_reason = final.stop_reason
        result.request_id = getattr(final, "_request_id", None)
        result.latency_ms = int((time.monotonic() - start) * 1000)

    async def complete_json(self, *, model, system, prompt, schema, effort, max_tokens):
        """Resposta garantida no formato do JSON schema (structured outputs)."""
        import json

        start = time.monotonic()
        try:
            msg = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": prompt}],
            )
        except self._anthropic.APIError as e:
            raise self._translate_error(e) from e
        if msg.stop_reason == "refusal":
            raise ProviderError("refused")
        text = next((b.text for b in msg.content if b.type == "text"), "{}")
        completion = Completion(
            model=msg.model,
            text=text,
            usage=self._usage(msg.usage),
            stop_reason=msg.stop_reason,
            request_id=getattr(msg, "_request_id", None),
            latency_ms=int((time.monotonic() - start) * 1000),
        )
        return json.loads(text), completion

    async def complete(self, *, model, system, prompt, effort, max_tokens):
        start = time.monotonic()
        try:
            msg = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                thinking={"type": "disabled"},
                output_config={"effort": effort},
                messages=[{"role": "user", "content": prompt}],
            )
        except self._anthropic.APIError as e:
            raise self._translate_error(e) from e
        return Completion(
            model=msg.model,
            text="".join(b.text for b in msg.content if b.type == "text"),
            usage=self._usage(msg.usage),
            stop_reason=msg.stop_reason,
            request_id=getattr(msg, "_request_id", None),
            latency_ms=int((time.monotonic() - start) * 1000),
        )


class FakeProvider:
    """Respostas fixas para testes automatizados e desenvolvimento sem chave da Anthropic."""

    name = "fake"

    async def stream(self, *, model, system, messages, effort, max_tokens, result):
        question = str(messages[-1]["content"])
        body = (
            "[Resposta de teste — IA real não configurada]\n\n"
            "## Texto analisado\nTrecho enviado pelo leitor.\n\n"
            "## Referências relacionadas\nCompare com Gênesis 1:1 e João 1:14."
        )
        if "INVALIDREF" in question:
            body += " Veja também João 30:1."
        result.model = "fake"
        for word in body.split(" "):
            yield word + " "
        result.text = body
        result.usage = Usage(input_tokens=len(question) // 4 + 900, output_tokens=len(body) // 4)
        result.stop_reason = "end_turn"
        result.latency_ms = 5

    @staticmethod
    def _sample(spec: dict, name: str):
        """Valor de teste que respeita o JSON schema (inclusive listas de objetos)."""
        kind = spec.get("type")
        if kind == "object":
            return {k: FakeProvider._sample(v, k) for k, v in spec.get("properties", {}).items()}
        if kind == "array":
            item = spec.get("items", {"type": "string"})
            if name == "references":
                return ["João 3:16", "Romanos 5:8"]
            return [FakeProvider._sample(item, f"{name} {i}") for i in range(1, 4)]
        if kind in ("integer", "number"):
            return 0
        if kind == "boolean":
            return False
        return f"[Conteúdo de teste — IA real não configurada] {name}"

    async def complete_json(self, *, model, system, prompt, schema, effort, max_tokens):
        data = self._sample(schema, "root")
        return data, Completion(
            model="fake", usage=Usage(input_tokens=len(prompt) // 4 + 600, output_tokens=400)
        )

    async def complete(self, *, model, system, prompt, effort, max_tokens):
        off_topic = any(
            w in prompt.lower() for w in ("dólar", "dolar", "bitcoin", "futebol", "receita de bolo")
        )
        return Completion(
            model="fake", text="OFF" if off_topic else "ON", usage=Usage(input_tokens=60, output_tokens=1)
        )


class DeepSeekProvider:
    """DeepSeek (API no formato da OpenAI). Bem mais barata: usada para traduções e tarefas
    simples. O "effort" não se aplica e é ignorado."""

    name = "deepseek"
    URL = "https://api.deepseek.com/chat/completions"
    MAX_OUTPUT = 32000

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    @staticmethod
    def _effort(effort: str) -> str:
        """Esforço do painel → raciocínio da DeepSeek. "low" desliga o raciocínio (traduções:
        mais rápido e mais barato)."""
        return {"low": "none", "medium": "low", "high": "high"}.get(effort, "none")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    @staticmethod
    def _usage(raw: dict | None) -> Usage:
        raw = raw or {}
        hit = int(raw.get("prompt_cache_hit_tokens") or 0)
        return Usage(
            input_tokens=int(raw.get("prompt_tokens") or 0) - hit,
            output_tokens=int(raw.get("completion_tokens") or 0),
            cache_read_tokens=hit,
        )

    async def _post(self, body: dict) -> dict:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(self.URL, headers=self._headers(), json=body)
        except httpx.HTTPError as e:
            raise ProviderError("unavailable", str(e)) from e
        if r.status_code == 429:
            raise ProviderError("rate_limited")
        if r.status_code in (401, 403):
            raise ProviderError("auth")
        if r.status_code >= 400:
            raise ProviderError("unavailable", r.text[:200])
        return r.json()

    async def stream(self, *, model, system, messages, effort, max_tokens, result):
        import json

        import httpx

        start = time.monotonic()
        body = {
            "model": model,
            "messages": [{"role": "system", "content": system}, *messages],
            "max_tokens": min(max_tokens, self.MAX_OUTPUT),
            "reasoning_effort": self._effort(effort),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        parts: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                async with client.stream("POST", self.URL, headers=self._headers(), json=body) as r:
                    if r.status_code >= 400:
                        detail = (await r.aread())[:200].decode(errors="ignore")
                        raise ProviderError("unavailable", detail)
                    async for line in r.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        chunk = json.loads(line[6:])
                        if chunk.get("usage"):
                            result.usage = self._usage(chunk["usage"])
                        for choice in chunk.get("choices") or []:
                            text = (choice.get("delta") or {}).get("content")
                            if text:
                                parts.append(text)
                                yield text
                            if choice.get("finish_reason"):
                                result.stop_reason = choice["finish_reason"]
        except httpx.HTTPError as e:
            raise ProviderError("unavailable", str(e)) from e
        result.model = model
        result.text = "".join(parts)
        result.latency_ms = int((time.monotonic() - start) * 1000)

    async def complete(self, *, model, system, prompt, effort, max_tokens):
        start = time.monotonic()
        data = await self._post(
            {
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "max_tokens": min(max_tokens, self.MAX_OUTPUT),
                "reasoning_effort": self._effort(effort),
            }
        )
        choice = data["choices"][0]
        return Completion(
            model=data.get("model", model),
            text=choice["message"].get("content") or "",
            usage=self._usage(data.get("usage")),
            stop_reason=choice.get("finish_reason"),
            request_id=data.get("id"),
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    async def complete_json(self, *, model, system, prompt, schema, effort, max_tokens):
        import json

        start = time.monotonic()
        # Modo JSON da DeepSeek: pede um objeto e descreve o formato no próprio pedido
        instructions = (
            system
            + "\n\nRespond only with a single JSON object that follows this JSON schema "
            + "(no markdown, no comments):\n"
            + json.dumps(schema, ensure_ascii=False)
        )
        data = await self._post(
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": min(max_tokens, self.MAX_OUTPUT),
                "reasoning_effort": self._effort(effort),
                "response_format": {"type": "json_object"},
            }
        )
        choice = data["choices"][0]
        text = choice["message"].get("content") or "{}"
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ProviderError("invalid_json", text[:200]) from e
        return parsed, Completion(
            model=data.get("model", model),
            text=text,
            usage=self._usage(data.get("usage")),
            stop_reason=choice.get("finish_reason"),
            request_id=data.get("id"),
            latency_ms=int((time.monotonic() - start) * 1000),
        )


class _ModelOverride:
    """Usa outro modelo no lugar do configurado (ex.: DeepSeek sem chave → Claude Haiku)."""

    def __init__(self, inner, model: str) -> None:
        self.inner, self.model, self.name = inner, model, inner.name

    def stream(self, **kw):
        return self.inner.stream(**{**kw, "model": self.model})

    async def complete(self, **kw):
        return await self.inner.complete(**{**kw, "model": self.model})

    async def complete_json(self, **kw):
        return await self.inner.complete_json(**{**kw, "model": self.model})


DEEPSEEK_FALLBACK = "claude-haiku-5-5"
_provider: AIProvider | None = None
_deepseek: DeepSeekProvider | None = None


def is_deepseek(model: str | None) -> bool:
    return bool(model) and str(model).startswith("deepseek")


def get_provider(model: str | None = None) -> AIProvider:
    """Provedor do modelo configurado: DeepSeek para modelos "deepseek-*", senão Claude (com a
    chave atual do painel ou do ambiente). Modelo DeepSeek sem chave cadastrada usa o Claude Haiku."""
    global _provider, _deepseek
    if is_deepseek(model):
        key = secrets.get("deepseek_api_key")
        if key and get_settings().ai_provider != "fake":
            if _deepseek is None or _deepseek.api_key != key:
                _deepseek = DeepSeekProvider(key)
            return _deepseek
        return _ModelOverride(get_provider(), DEEPSEEK_FALLBACK)  # type: ignore[return-value]
    settings = get_settings()
    key = secrets.get("anthropic_api_key")
    use_fake = settings.ai_provider == "fake" or (
        settings.ai_provider == "auto" and not key and settings.env in ("development", "test")
    )
    if use_fake:
        if not isinstance(_provider, FakeProvider):
            _provider = FakeProvider()
    elif not isinstance(_provider, AnthropicProvider) or _provider.api_key != key:
        _provider = AnthropicProvider(key)
    return _provider


def reset_provider() -> None:
    global _provider, _deepseek
    _provider = None
    _deepseek = None
