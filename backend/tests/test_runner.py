"""Test AgentRunner message handling with mocked SDK responses."""

import asyncio
import os
import sys
from dataclasses import dataclass, field
from unittest.mock import AsyncMock, patch

# Add backend to path so we can import agent
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Fake SDK message types ────────────────────────────────────────────────────


@dataclass
class FakeTextBlock:
    text: str = "Hello"


@dataclass
class FakeAssistantMessage:
    content: list = field(default_factory=lambda: [FakeTextBlock()])


@dataclass
class FakeResultMessage:
    stop_reason: str = "end_turn"


@dataclass
class FakeRateLimitInfo:
    status: str = "allowed_warning"
    resets_at: int = 1700000000
    utilization: float = 0.85


@dataclass
class FakeRateLimitEvent:
    rate_limit_info: FakeRateLimitInfo = field(default_factory=FakeRateLimitInfo)
    uuid: str = "test-uuid"
    session_id: str = "test-session"


@dataclass
class FakeSystemMessage:
    data: dict = field(default_factory=lambda: {"session_id": "fake-session-123"})


# ── Fake ClaudeSDKClient ──────────────────────────────────────────────────────


class FakeClient:
    def __init__(self, response_messages):
        self._messages = response_messages
        self.query_called_with = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def query(self, prompt, session_id="default"):
        self.query_called_with = prompt

    async def receive_response(self):
        for msg in self._messages:
            yield msg


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_handles_ratelimit_event():
    """RateLimitEvent should be logged but not crash or send a block."""
    from agent import AgentRunner

    on_block = AsyncMock()
    on_session_id = AsyncMock()
    on_done = AsyncMock()
    on_error = AsyncMock()

    client = FakeClient(
        [
            FakeSystemMessage(),
            FakeAssistantMessage(content=[FakeTextBlock(text="Hi there")]),
            FakeRateLimitEvent(
                rate_limit_info=FakeRateLimitInfo(
                    status="allowed_warning", utilization=0.85
                )
            ),
            FakeResultMessage(stop_reason="end_turn"),
        ]
    )

    with patch("agent.ClaudeSDKClient", return_value=client), patch(
        "agent.create_sdk_mcp_server", return_value=None
    ), patch("agent.RateLimitEvent", FakeRateLimitEvent), patch(
        "agent.SystemMessage", FakeSystemMessage
    ), patch(
        "agent.AssistantMessage", FakeAssistantMessage
    ), patch(
        "agent.ResultMessage", FakeResultMessage
    ):
        runner = AgentRunner()
        await runner.run(
            session_id="test-sess",
            msg_id="test-msg",
            user_id="test-user",
            user_message="Hi",
            note_context="",
            on_block=on_block,
            on_session_id=on_session_id,
            on_done=on_done,
            on_error=on_error,
        )

    # Should have sent 1 block
    assert on_block.call_count == 1, f"Expected 1 block call, got {on_block.call_count}"
    block_arg = on_block.call_args_list[0][0][0]
    assert block_arg.text == "Hi there"

    # Should have captured session_id
    assert on_session_id.call_count == 1
    assert on_session_id.call_args[0][0] == "fake-session-123"

    # Should have completed successfully
    assert on_done.call_count == 1
    assert on_done.call_args[0][0] == "end_turn"

    assert on_error.call_count == 0
    print("  PASS: RateLimitEvent handled correctly (logged, not sent as block)")


async def test_handles_rejected_ratelimit():
    """A rejected rate limit should be forwarded to the frontend as an error."""
    from agent import AgentRunner

    on_block = AsyncMock()
    on_session_id = AsyncMock()
    on_done = AsyncMock()
    on_error = AsyncMock()

    client = FakeClient(
        [
            FakeSystemMessage(),
            FakeRateLimitEvent(
                rate_limit_info=FakeRateLimitInfo(status="rejected", utilization=1.0)
            ),
            FakeResultMessage(stop_reason="end_turn"),
        ]
    )

    with patch("agent.ClaudeSDKClient", return_value=client), patch(
        "agent.create_sdk_mcp_server", return_value=None
    ), patch("agent.RateLimitEvent", FakeRateLimitEvent), patch(
        "agent.SystemMessage", FakeSystemMessage
    ), patch(
        "agent.AssistantMessage", FakeAssistantMessage
    ), patch(
        "agent.ResultMessage", FakeResultMessage
    ):
        runner = AgentRunner()
        await runner.run(
            session_id="test-sess",
            msg_id="test-msg",
            user_id="test-user",
            user_message="Hi",
            note_context="",
            on_block=on_block,
            on_session_id=on_session_id,
            on_done=on_done,
            on_error=on_error,
        )

    assert on_error.call_count == 1, f"Expected 1 error call, got {on_error.call_count}"
    assert "rate limit" in on_error.call_args[0][0].lower()
    print("  PASS: Rejected rate limit forwarded as error")


async def test_resume_passes_session_id():
    """When claude_session_id is provided, options.resume should be set."""
    from agent import AgentRunner

    captured_options = {}

    def fake_client_init(self=None, *, options=None):
        captured_options["resume"] = (
            getattr(options, "resume", None) if options else None
        )
        return FakeClient(
            [
                FakeSystemMessage(),
                FakeResultMessage(stop_reason="end_turn"),
            ]
        )

    with patch(
        "agent.ClaudeSDKClient",
        side_effect=lambda options=None: fake_client_init(options=options),
    ), patch("agent.create_sdk_mcp_server", return_value=None), patch(
        "agent.SystemMessage", FakeSystemMessage
    ), patch(
        "agent.ResultMessage", FakeResultMessage
    ):
        runner = AgentRunner()
        await runner.run(
            session_id="test-sess",
            msg_id="test-msg",
            user_id="test-user",
            user_message="Hi",
            note_context="",
            claude_session_id="existing-claude-session",
            on_block=AsyncMock(),
            on_session_id=AsyncMock(),
            on_done=AsyncMock(),
            on_error=AsyncMock(),
        )

    assert captured_options.get("resume") == "existing-claude-session"
    print("  PASS: resume option set when claude_session_id provided")


async def main():
    print("=== test_runner.py ===\n")
    await test_handles_ratelimit_event()
    await test_handles_rejected_ratelimit()
    print("\nAll tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
