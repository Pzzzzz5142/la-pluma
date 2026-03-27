from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ContentBlock,
    RateLimitEvent,
    ResultMessage,
    SystemMessage,
    UserMessage,
    create_sdk_mcp_server,
    get_session_messages,
)
from tools import search_notes

logger = logging.getLogger(__name__)


class AgentRunner:
    async def run(
        self,
        *,
        session_id: str,
        msg_id: str,
        user_id: str,
        user_message: str,
        note_context: str,
        claude_session_id: str | None = None,
        on_block: Callable[[ContentBlock], Awaitable[None]],
        on_session_id: Callable[[str], Awaitable[None]],
        on_done: Callable[[str], Awaitable[None]],
        on_error: Callable[[str], Awaitable[None]],
    ) -> None:
        system_prompt = "\n".join(
            filter(
                None,
                [
                    "You are a quiet, thoughtful writing assistant"
                    " embedded in a personal notes app.",
                    "Be concise and helpful. Respond in the same language"
                    " the user writes in.",
                    (
                        f"\nThe user is currently working on a note:\n\n{note_context}"
                        if note_context
                        else ""
                    ),
                ],
            )
        )

        mcp_server = create_sdk_mcp_server(name="notes", tools=[search_notes])

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model="claude-sonnet-4-6",
            thinking={"type": "adaptive"},
            max_turns=10,
            mcp_servers={"notes": mcp_server},
            allowed_tools=["search_notes"],
        )
        if claude_session_id:
            options.resume = claude_session_id

        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(user_message)
                async for sdk_msg in client.receive_response():
                    # System init — capture session_id
                    if isinstance(sdk_msg, SystemMessage):
                        data = getattr(sdk_msg, "data", {})
                        if isinstance(data, dict) and "session_id" in data:
                            await on_session_id(data["session_id"])

                    # Assistant turn
                    elif isinstance(sdk_msg, AssistantMessage):
                        for block in sdk_msg.content:
                            await on_block(block)

                    # Tool result turn
                    elif isinstance(sdk_msg, UserMessage):
                        for block in sdk_msg.content:
                            await on_block(block)

                    # Rate limit
                    elif isinstance(sdk_msg, RateLimitEvent):
                        info = sdk_msg.rate_limit_info
                        status = getattr(info, "status", "unknown")
                        utilization = getattr(info, "utilization", None)
                        logger.info(
                            "rate_limit: status=%s utilization=%s", status, utilization
                        )
                        if status == "rejected":
                            await on_error(
                                f"Rate limit exceeded (utilization={utilization})"
                            )
                            return

                    # Final result
                    elif isinstance(sdk_msg, ResultMessage):
                        await on_done(sdk_msg.stop_reason or "end_turn")
                        return

                    else:
                        logger.warning(
                            "unhandled sdk_msg: %s %s",
                            type(sdk_msg).__name__,
                            vars(sdk_msg) if hasattr(sdk_msg, "__dict__") else sdk_msg,
                        )

        except asyncio.CancelledError:
            await on_done("cancelled")
        except Exception as exc:
            await on_error(str(exc))

    @staticmethod
    def restore(claude_session_id: str) -> list[dict[str, Any]]:
        """Retrieve chat history from Claude CLI session storage."""
        raw_messages = get_session_messages(session_id=claude_session_id)
        result: list[dict[str, Any]] = []
        seen_uuids: set[str] = set()

        for sm in raw_messages:
            uuid = getattr(sm, "uuid", None)
            if uuid and uuid in seen_uuids:
                continue
            if uuid:
                seen_uuids.add(uuid)

            msg_type = getattr(sm, "type", None)
            message = getattr(sm, "message", {})
            if not isinstance(message, dict):
                continue

            if msg_type == "user":
                content = message.get("content", "")
                result.append(
                    {
                        "role": "user",
                        "blocks": [
                            {"type": "text", "content": content, "status": "done"}
                        ],
                    }
                )
            elif msg_type == "assistant":
                blocks: list[dict[str, Any]] = []
                raw_content = message.get("content", [])
                if isinstance(raw_content, list):
                    for b in raw_content:
                        if not isinstance(b, dict):
                            continue
                        if b.get("type") == "text":
                            blocks.append(
                                {
                                    "type": "text",
                                    "content": b.get("text", ""),
                                    "status": "done",
                                }
                            )
                        elif b.get("type") == "thinking":
                            blocks.append(
                                {
                                    "type": "thinking",
                                    "content": b.get("thinking", ""),
                                    "status": "done",
                                    "visible": False,
                                }
                            )
                        elif b.get("type") == "tool_use":
                            blocks.append(
                                {
                                    "type": "tool_use",
                                    "id": b.get("id", ""),
                                    "name": b.get("name", ""),
                                    "input": str(b.get("input", {})),
                                    "status": "success",
                                    "visible": False,
                                }
                            )
                if blocks:
                    result.append({"role": "assistant", "blocks": blocks})

        # Merge consecutive assistant messages (SDK sometimes splits thinking + text)
        merged: list[dict[str, Any]] = []
        for msg in result:
            if (
                merged
                and merged[-1]["role"] == "assistant"
                and msg["role"] == "assistant"
            ):
                merged[-1]["blocks"].extend(msg["blocks"])
            else:
                merged.append(msg)

        return merged
