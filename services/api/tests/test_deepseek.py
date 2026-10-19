from app.ai import provider as provider_module
from app.ai.provider import DeepSeekProvider, FakeProvider, get_provider
from app.services import secrets


async def test_deepseek_json_and_usage(monkeypatch):
    p = DeepSeekProvider("sk-test")
    sent = {}

    async def fake_post(body):
        sent.update(body)
        return {
            "id": "r1",
            "model": "deepseek-flash",
            "choices": [{"message": {"content": '{"title": "Hello"}'}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 120, "completion_tokens": 30, "prompt_cache_hit_tokens": 100},
        }

    monkeypatch.setattr(p, "_post", fake_post)
    data, completion = await p.complete_json(
        model="deepseek-flash",
        system="Translate.",
        prompt="Olá",
        schema={"type": "object"},
        effort="low",
        max_tokens=20000,
    )
    assert data == {"title": "Hello"}
    assert (
        sent["response_format"] == {"type": "json_object"}
        and sent["max_tokens"] == 20000
        and sent["reasoning_effort"] == "none"
    )
    assert "JSON schema" in sent["messages"][0]["content"]
    assert (
        completion.usage.input_tokens,
        completion.usage.cache_read_tokens,
        completion.usage.output_tokens,
    ) == (
        20,
        100,
        30,
    )


def test_deepseek_is_used_only_with_a_key(monkeypatch):
    provider_module.reset_provider()
    # Sem chave: o modelo DeepSeek cai para o Claude Haiku (aqui, o provedor de teste)
    fallback = get_provider("deepseek-flash")
    assert fallback.model == "claude-haiku-5-5" and isinstance(fallback.inner, FakeProvider)

    monkeypatch.setattr(secrets, "get", lambda name: "sk-live" if name == "deepseek_api_key" else None)
    monkeypatch.setattr(provider_module.get_settings(), "ai_provider", "auto")
    chosen = get_provider("deepseek-flash")
    assert isinstance(chosen, DeepSeekProvider) and chosen.api_key == "sk-live"
    assert not isinstance(get_provider("claude-opus-5-5"), DeepSeekProvider)
    provider_module.reset_provider()
