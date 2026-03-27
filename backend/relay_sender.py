"""Relay WebSocket message sender — serializes SDK blocks and sends to relay."""

from __future__ import annotations

import dataclasses
import json
import logging
from typing import Any

from claude_agent_sdk import (
    ContentBlock,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
)

logger = logging.getLogger(__name__)

_BLOCK_TYPE = {
    TextBlock: "text",
    ThinkingBlock: "thinking",
    ToolUseBlock: "tool_use",
    ToolResultBlock: "tool_result",
}


def _serialize_block(block: ContentBlock) -> dict[str, Any]:
    d = dataclasses.asdict(block)
    d["type"] = _BLOCK_TYPE.get(type(block), type(block).__name__)
    return d


class RelaySender:
    """Wraps a websocket connection and provides typed send methods
    for the relay protocol."""

    def __init__(self, ws: Any, session_id: str, msg_id: str) -> None:
        self._ws = ws
        self._session_id = session_id
        self._msg_id = msg_id

    async def send_block(self, block: ContentBlock) -> None:
        data = _serialize_block(block)
        self._log_block(data)
        await self._ws.send(
            json.dumps(
                {
                    "type": "block",
                    "sessionId": self._session_id,
                    "msgId": self._msg_id,
                    "block": data,
                }
            )
        )

    async def send_session_id(self, claude_session_id: str) -> None:
        logger.info("[session_id] claude=%s", claude_session_id[:8])
        await self._ws.send(
            json.dumps(
                {
                    "type": "session_id",
                    "sessionId": self._session_id,
                    "msgId": self._msg_id,
                    "claudeSessionId": claude_session_id,
                }
            )
        )

    async def send_done(
        self, stop_reason: str, *, chat_version: int | None = None
    ) -> None:
        logger.info(
            "[done] session=%s stop_reason=%s", self._session_id[:8], stop_reason
        )
        payload: dict[str, Any] = {
            "type": "done",
            "sessionId": self._session_id,
            "msgId": self._msg_id,
            "stopReason": stop_reason,
        }
        if chat_version is not None:
            payload["chatVersion"] = chat_version
        await self._ws.send(json.dumps(payload))

    async def send_error(self, error: str) -> None:
        logger.info("[error] session=%s error=%s", self._session_id[:8], error)
        await self._ws.send(
            json.dumps(
                {
                    "type": "error",
                    "sessionId": self._session_id,
                    "msgId": self._msg_id,
                    "error": error,
                }
            )
        )

    def _log_block(self, block: dict[str, Any]) -> None:
        block_type = block.get("type", "?")
        if block_type == "text":
            text = str(block.get("text", ""))
            logger.info(
                '[block] text (%d chars): "%s"', len(text), text[:80].replace("\n", " ")
            )
        elif block_type == "thinking":
            thinking = str(block.get("thinking", ""))
            logger.info("[block] thinking (%d chars)", len(thinking))
        elif block_type == "tool_use":
            logger.info(
                "[block] tool_use name=%s input=%s",
                block.get("name"),
                json.dumps(block.get("input", {}))[:80],
            )
        elif block_type == "tool_result":
            logger.info(
                "[block] tool_result tool_use_id=%s",
                str(block.get("tool_use_id", ""))[:8],
            )
        else:
            logger.info("[block] %s", block_type)
