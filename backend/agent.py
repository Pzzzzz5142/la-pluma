from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable

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
)
from tools import search_notes

XHS_MCP_URL = os.environ.get("XHS_MCP_URL", "http://localhost:18060/mcp")

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
        xhs_server: dict[str, str] = {"type": "http", "url": XHS_MCP_URL}

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model="claude-sonnet-4-6",
            thinking={"type": "adaptive"},
            max_turns=10,
            mcp_servers={"notes": mcp_server, "xhs": xhs_server},  # type: ignore
            allowed_tools=[
                "search_notes",
                "mcp__xhs__check_login_status",
                "mcp__xhs__list_feeds",
                "mcp__xhs__search_feeds",
                "mcp__xhs__get_feed_detail",
                "mcp__xhs__like_feed",
                "mcp__xhs__favorite_feed",
                "mcp__xhs__post_comment_to_feed",
                "mcp__xhs__reply_comment_in_feed",
                "mcp__xhs__publish_content",
                "mcp__xhs__publish_with_video",
                "mcp__xhs__user_profile",
                "mcp__xhs__get_login_qrcode",
                "mcp__xhs__delete_cookies",
            ],
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
