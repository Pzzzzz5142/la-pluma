from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import websockets
from agent import AgentRunner
from dotenv import load_dotenv
from fastapi import FastAPI
from relay_sender import RelaySender

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

RELAY_URL = os.environ["RELAY_URL"]
RELAY_SECRET = os.environ["RELAY_SECRET"]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_KEY", "")

# msgId → asyncio.Task
_runners: dict[str, asyncio.Task[None]] = {}


# ---------------------------------------------------------------------------
# Supabase helpers (chat_version) — uses anon key + user JWT for RLS
# ---------------------------------------------------------------------------


def _get_supabase(user_token: str):
    from supabase import create_client

    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(user_token)
    return sb


async def _bump_chat_version(note_id: str, user_token: str) -> int:
    """Increment chat_version and return the new value."""
    sb = _get_supabase(user_token)
    # Read current, increment, write back
    result = (
        sb.table("notes").select("chat_version").eq("id", note_id).single().execute()
    )
    current = result.data.get("chat_version", 0) if result.data else 0
    new_version = current + 1
    sb.table("notes").update({"chat_version": new_version}).eq("id", note_id).execute()
    return new_version


async def _get_chat_version(note_id: str, user_token: str) -> int:
    sb = _get_supabase(user_token)
    result = (
        sb.table("notes").select("chat_version").eq("id", note_id).single().execute()
    )
    return result.data.get("chat_version", 0) if result.data else 0


# ---------------------------------------------------------------------------
# Relay connection loop
# ---------------------------------------------------------------------------


async def relay_loop() -> None:
    backoff = 1.0
    while True:
        try:
            async with websockets.connect(RELAY_URL) as ws:
                backoff = 1.0
                logger.info(f"Connected to relay: {RELAY_URL}")

                await ws.send(
                    json.dumps({"type": "agent_auth", "secret": RELAY_SECRET})
                )
                ack = json.loads(await ws.recv())
                if ack.get("type") != "agent_auth_ok":
                    logger.info(f"Auth failed: {ack}")
                    return

                logger.info("Authenticated with relay — ready")

                async for raw in ws:
                    msg: dict[str, Any] = json.loads(raw)
                    await handle_relay_message(ws, msg)

        except (websockets.ConnectionClosed, OSError) as exc:
            logger.info(f"Relay disconnected: {exc}. Reconnecting in {backoff:.0f}s...")
        except Exception as exc:
            logger.info(f"Unexpected error: {exc!r}. Reconnecting in {backoff:.0f}s...")

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60.0)


async def handle_relay_message(
    ws: websockets.ClientConnection, msg: dict[str, Any]
) -> None:
    msg_type = msg.get("type")

    if msg_type == "chat":
        session_id: str = msg["sessionId"]
        msg_id: str = msg["msgId"]
        user_message: str = msg["userMessage"]
        note_context: str = msg.get("noteContext", "")
        user_id: str = msg.get("userId", "")
        claude_session_id: str | None = msg.get("claudeSessionId") or None
        note_id: str | None = msg.get("noteId") or None
        user_token: str = msg.get("userToken", "")

        preview = user_message[:80].replace("\n", " ")
        logger.info(f'[chat] user={user_id}  session={session_id[:8]}  msg="{preview}"')
        if claude_session_id:
            logger.info(f"[chat] resuming claude session {claude_session_id[:8]}")

        sender = RelaySender(ws, session_id, msg_id)

        async def on_session_id(cid: str) -> None:
            logger.info(f"[session_id] claude={cid[:8]}")
            await sender.send_session_id(cid)

        async def on_done(stop_reason: str) -> None:
            if note_id and user_token:
                try:
                    chat_version = await _bump_chat_version(note_id, user_token)
                    await sender.send_done(stop_reason, chat_version=chat_version)
                except Exception as exc:
                    logger.warning(f"[chat] failed to bump chat_version: {exc}")
                    await sender.send_done(stop_reason)
            else:
                await sender.send_done(stop_reason)
            _runners.pop(msg_id, None)

        async def on_error(error: str) -> None:
            await sender.send_error(error)
            _runners.pop(msg_id, None)

        runner = AgentRunner()
        task = asyncio.create_task(
            runner.run(
                session_id=session_id,
                msg_id=msg_id,
                user_id=user_id,
                user_message=user_message,
                note_context=note_context,
                claude_session_id=claude_session_id,
                on_block=sender.send_block,
                on_session_id=on_session_id,
                on_done=on_done,
                on_error=on_error,
            )
        )
        _runners[msg_id] = task
        logger.info(f"[chat] runner started  active_runners={len(_runners)}")

    elif msg_type == "restore":
        session_id = msg["sessionId"]
        restore_claude_id: str = msg["claudeSessionId"]
        restore_note_id: str = msg.get("noteId", "")
        restore_user_token: str = msg.get("userToken", "")
        logger.info(f"[restore] claude={restore_claude_id[:8]}")
        try:
            history = AgentRunner.restore(restore_claude_id)
            chat_version = 0
            if restore_note_id and restore_user_token:
                chat_version = await _get_chat_version(
                    restore_note_id, restore_user_token
                )
            await ws.send(
                json.dumps(
                    {
                        "type": "restore_ok",
                        "sessionId": session_id,
                        "messages": history,
                        "chatVersion": chat_version,
                    }
                )
            )
            logger.info(
                f"[restore] ok, {len(history)} messages, version={chat_version}"
            )
        except Exception as exc:
            logger.warning(f"[restore] failed: {exc}")
            await ws.send(
                json.dumps(
                    {
                        "type": "restore_error",
                        "sessionId": session_id,
                        "error": str(exc),
                    }
                )
            )

    elif msg_type == "cancel":
        msg_id = msg.get("msgId", "")
        task = _runners.pop(msg_id, None)
        if task:
            task.cancel()
            logger.info(f"[cancel] msgId={msg_id[:8]}")
        else:
            logger.info(f"[cancel] no runner found for msgId={msg_id[:8]}")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(relay_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "active_runners": str(len(_runners))}
