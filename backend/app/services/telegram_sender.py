"""
Telegram delivery for scheduled AI-chat reports.

Uses the Telegram Bot API over HTTPS (no extra SDK). Configure a bot token via
@BotFather and set TELEGRAM_BOT_TOKEN in the environment.

Getting a chat_id: the recipient must message the bot at least once (or add it to
a group). Then `get_recent_chats()` surfaces the chat_id from getUpdates.
"""
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

TELEGRAM_API = "https://api.telegram.org"
MAX_MESSAGE_LEN = 4096  # Telegram hard limit per message


def is_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def _base_url() -> str:
    return f"{TELEGRAM_API}/bot{settings.TELEGRAM_BOT_TOKEN}"


async def send_message(chat_id: str, text: str, parse_mode: Optional[str] = None) -> Dict[str, Any]:
    """Send a message. Long text is truncated to Telegram's limit.

    parse_mode: None (plain), "HTML", or "MarkdownV2".
    """
    if not is_configured():
        return {"success": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    if len(text) > MAX_MESSAGE_LEN:
        text = text[: MAX_MESSAGE_LEN - 20] + "\n…(truncated)"

    payload: Dict[str, Any] = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{_base_url()}/sendMessage", json=payload)
            data = resp.json()
            if not data.get("ok"):
                return {"success": False, "error": data.get("description", "Telegram error")}
            return {"success": True, "message_id": data["result"]["message_id"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def send_photo(chat_id: str, image: bytes, caption: Optional[str] = None) -> Dict[str, Any]:
    """Send a PNG image (e.g. the report chart) as a photo."""
    if not is_configured():
        return {"success": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    data: Dict[str, Any] = {"chat_id": chat_id}
    if caption:
        data["caption"] = caption[:1024]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{_base_url()}/sendPhoto",
                data=data,
                files={"photo": ("chart.png", image, "image/png")},
            )
            body = resp.json()
            if not body.get("ok"):
                return {"success": False, "error": body.get("description", "Telegram error")}
            return {"success": True, "message_id": body["result"]["message_id"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def send_document(
    chat_id: str, filename: str, content: bytes, caption: Optional[str] = None
) -> Dict[str, Any]:
    """Send a file (e.g. the report CSV) as a document attachment."""
    if not is_configured():
        return {"success": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    data: Dict[str, Any] = {"chat_id": chat_id}
    if caption:
        # Captions have a 1024-char limit.
        data["caption"] = caption[:1024]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{_base_url()}/sendDocument",
                data=data,
                files={"document": (filename, content, "text/csv")},
            )
            body = resp.json()
            if not body.get("ok"):
                return {"success": False, "error": body.get("description", "Telegram error")}
            return {"success": True, "message_id": body["result"]["message_id"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_recent_chats() -> Dict[str, Any]:
    """Return distinct chats seen in recent updates, to help users find a chat_id."""
    if not is_configured():
        return {"success": False, "error": "TELEGRAM_BOT_TOKEN not configured", "chats": []}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{_base_url()}/getUpdates")
            body = resp.json()
            if not body.get("ok"):
                return {"success": False, "error": body.get("description", "Telegram error"), "chats": []}

            seen: Dict[str, Dict[str, Any]] = {}
            for update in body.get("result", []):
                msg = update.get("message") or update.get("channel_post") or {}
                chat = msg.get("chat")
                if not chat:
                    continue
                chat_id = str(chat.get("id"))
                if chat_id in seen:
                    continue
                name = (
                    chat.get("title")
                    or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")]))
                    or chat.get("username")
                    or chat_id
                )
                seen[chat_id] = {"chat_id": chat_id, "name": name, "type": chat.get("type")}

            return {"success": True, "chats": list(seen.values())}
    except Exception as e:
        return {"success": False, "error": str(e), "chats": []}
