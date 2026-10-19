"""Envio de e-mails transacionais (Resend em staging/produção; console ou memória no desenvolvimento)."""

import html
import logging
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.services import secrets

log = logging.getLogger("biblealpha.email")


@dataclass
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str
    # Link de ação incluído (útil para testes e para o log de desenvolvimento)
    action_url: str | None = None


# Caixa de saída em memória (backend "memory", usado nos testes)
outbox: list[EmailMessage] = []

_COPY = {
    "verify_email": {
        "pt-BR": (
            "Confirme seu e-mail no BibleAlpha",
            "Confirme seu e-mail",
            "Falta pouco para começar. Toque no botão abaixo para confirmar seu e-mail.",
            "Confirmar e-mail",
            "O link vale por 24 horas. Se você não criou uma conta no BibleAlpha, ignore esta mensagem.",
        ),
        "en": (
            "Confirm your BibleAlpha email",
            "Confirm your email",
            "You're almost there. Tap the button below to confirm your email.",
            "Confirm email",
            "This link is valid for 24 hours. "
            "If you didn't create a BibleAlpha account, ignore this message.",
        ),
        "es": (
            "Confirma tu correo en BibleAlpha",
            "Confirma tu correo",
            "Ya casi está. Toca el botón de abajo para confirmar tu correo.",
            "Confirmar correo",
            "El enlace es válido por 24 horas. Si no creaste una cuenta en BibleAlpha, ignora este mensaje.",
        ),
    },
    "account_exists": {
        "pt-BR": (
            "Você já tem uma conta no BibleAlpha",
            "Você já tem uma conta",
            "Alguém tentou criar uma conta no BibleAlpha com este e-mail, mas ele já está cadastrado. "
            "Se foi você, basta entrar. Esqueceu a senha? Use o botão abaixo.",
            "Redefinir senha",
            "Se não foi você, ignore esta mensagem; nada mudou na sua conta.",
        ),
        "en": (
            "You already have a BibleAlpha account",
            "You already have an account",
            "Someone tried to create a BibleAlpha account with this email, but it is already registered. "
            "If it was you, just sign in. Forgot your password? Use the button below.",
            "Reset password",
            "If it wasn't you, ignore this message; nothing changed in your account.",
        ),
        "es": (
            "Ya tienes una cuenta en BibleAlpha",
            "Ya tienes una cuenta",
            "Alguien intentó crear una cuenta en BibleAlpha con este correo, pero ya está registrado. "
            "Si fuiste tú, solo inicia sesión. ¿Olvidaste tu contraseña? Usa el botón de abajo.",
            "Restablecer contraseña",
            "Si no fuiste tú, ignora este mensaje; nada cambió en tu cuenta.",
        ),
    },
    "reset_password": {
        "pt-BR": (
            "Redefinição de senha do BibleAlpha",
            "Redefinir senha",
            "Recebemos um pedido para redefinir a senha da sua conta.",
            "Criar nova senha",
            "O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem; "
            "sua senha continua a mesma.",
        ),
        "en": (
            "Reset your BibleAlpha password",
            "Reset your password",
            "We received a request to reset your account password.",
            "Choose a new password",
            "This link is valid for 1 hour and can be used once. If it wasn't you, ignore this message; "
            "your password stays the same.",
        ),
        "es": (
            "Restablece tu contraseña de BibleAlpha",
            "Restablecer contraseña",
            "Recibimos una solicitud para restablecer la contraseña de tu cuenta.",
            "Crear nueva contraseña",
            "El enlace es válido por 1 hora y solo se puede usar una vez. Si no fuiste tú, ignora este "
            "mensaje; tu contraseña sigue igual.",
        ),
    },
}


def _lang(locale: str) -> str:
    lang = locale.lower()[:2]
    return "pt-BR" if lang == "pt" else lang if lang in ("en", "es") else "en"


def _render(kind: str, locale: str, url: str) -> tuple[str, str, str]:
    return _page(*_COPY[kind][_lang(locale)], url=url)


def _page(subject: str, title: str, body: str, button: str, footer: str, *, url: str) -> tuple[str, str, str]:
    safe_url = html.escape(url, quote=True)
    page = f"""<!doctype html><html><body style="margin:0;background:#0B0906;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:520px;background:#16120C;border:1px solid #6b4e17;border-radius:16px">
<tr><td style="padding:32px 32px 8px;text-align:center;font-size:28px;color:#EDEBE6">
Bible<span style="color:#E8B23A">Alpha</span></td></tr>
<tr><td style="padding:8px 32px;color:#EDEBE6;font-size:20px">{html.escape(title)}</td></tr>
<tr><td style="padding:8px 32px;color:#cfc9bd;font-family:Arial,sans-serif;font-size:15px;line-height:1.6">
{html.escape(body).replace(chr(10), "<br>")}</td></tr>
<tr><td style="padding:24px 32px" align="center"><a href="{safe_url}" style="background:#E8B23A;color:#0B0906;
text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;padding:14px 28px;border-radius:999px;
display:inline-block">{html.escape(button)}</a></td></tr>
<tr><td style="padding:0 32px 32px;color:#8f887a;font-family:Arial,sans-serif;font-size:12px;line-height:1.6">
{html.escape(footer)}<br><br>{safe_url}</td></tr>
</table></td></tr></table></body></html>"""
    text = f"{title}\n\n{body}\n\n{button}: {url}\n\n{footer}"
    return subject, page, text


async def send_action_email(kind: str, to: str, locale: str, url: str) -> None:
    subject, page, text = _render(kind, locale, url)
    await send(EmailMessage(to=to, subject=subject, html=page, text=text, action_url=url))


_REMINDER = {
    "pt-BR": (
        "Lembrete: {church} em {date}",
        "Seu compromisso está chegando",
        "Abrir na agenda",
        "Você recebeu este lembrete porque marcou este compromisso na agenda do BibleAlpha.",
        "{date} às {time}",
        "Local",
        "Mensagem",
        "Observações",
    ),
    "en": (
        "Reminder: {church} on {date}",
        "Your appointment is coming up",
        "Open in the schedule",
        "You received this reminder because you added this appointment to your BibleAlpha schedule.",
        "{date} at {time}",
        "Place",
        "Message",
        "Notes",
    ),
    "es": (
        "Recordatorio: {church} el {date}",
        "Tu compromiso se acerca",
        "Abrir en la agenda",
        "Recibiste este recordatorio porque agregaste este compromiso a tu agenda de BibleAlpha.",
        "{date} a las {time}",
        "Lugar",
        "Mensaje",
        "Observaciones",
    ),
}


async def send_agenda_reminder(
    to: str,
    locale: str,
    *,
    church: str,
    date: str,
    time: str,
    address: str,
    message: str | None,
    notes: str,
    url: str,
) -> None:
    subject, title, button, footer, when, place, msg_label, notes_label = _REMINDER[_lang(locale)]
    lines = [when.format(date=date, time=time), church]
    if address:
        lines.append(f"{place}: {address}")
    if message:
        lines.append(f"{msg_label}: {message}")
    if notes.strip():
        lines.append(f"{notes_label}: {notes.strip()}")
    subj, page, text = _page(
        subject.format(church=church, date=date), title, "\n".join(lines), button, footer, url=url
    )
    await send(EmailMessage(to=to, subject=subj, html=page, text=text, action_url=url))


async def send(message: EmailMessage) -> None:
    settings = get_settings()
    if settings.email_backend == "memory":
        outbox.append(message)
        return
    if settings.email_backend == "console":
        log.warning("E-mail (console) para %s: %s -> %s", message.to, message.subject, message.action_url)
        return
    api_key = secrets.get("resend_api_key")
    if not api_key:
        log.error(
            "Chave do Resend não configurada (painel ou BA_RESEND_API_KEY); e-mail para %s não enviado",
            message.to,
        )
        return
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": secrets.get("email_from") or settings.email_from,
                "to": [message.to],
                "subject": message.subject,
                "html": message.html,
                "text": message.text,
            },
        )
    if response.status_code >= 400:
        # Não registra o corpo do e-mail (contém o link com token)
        log.error("Resend recusou o e-mail (%s): %s", response.status_code, response.text[:300])
