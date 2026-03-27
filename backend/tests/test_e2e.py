"""End-to-end test: real AgentRunner with real Claude API,
including session resume."""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from agent import AgentRunner  # noqa: E402
from claude_agent_sdk import TextBlock, ThinkingBlock  # noqa: E402


async def test_new_session():
    """Create a new session, verify we get a session_id and a response."""
    print("=== E2E Test 1: New session ===\n")

    blocks: list = []
    done_reason: str | None = None
    error_msg: str | None = None
    captured_session_id: str | None = None

    async def on_block(block):
        if isinstance(block, TextBlock):
            print(f"  [block] text: {block.text[:200]}")
        elif isinstance(block, ThinkingBlock):
            print(f"  [block] thinking ({len(block.thinking)} chars)")
        else:
            print(f"  [block] {type(block).__name__}")
        blocks.append(block)

    async def on_session_id(sid: str):
        nonlocal captured_session_id
        captured_session_id = sid
        print(f"  [session_id] {sid[:12]}...")

    async def on_done(reason: str):
        nonlocal done_reason
        done_reason = reason
        print(f"  [done] {reason}")

    async def on_error(err: str):
        nonlocal error_msg
        error_msg = err
        print(f"  [error] {err}")

    runner = AgentRunner()
    await runner.run(
        session_id="test-e2e",
        msg_id="test-msg-1",
        user_id="test-user",
        user_message="My secret code is ALPHA-42. Remember it.",
        note_context="",
        on_block=on_block,
        on_session_id=on_session_id,
        on_done=on_done,
        on_error=on_error,
    )

    print()
    assert error_msg is None, f"Got unexpected error: {error_msg}"
    assert done_reason == "end_turn", f"Expected end_turn, got {done_reason}"
    assert captured_session_id is not None, "No session_id captured"

    text_blocks = [b for b in blocks if isinstance(b, TextBlock)]
    assert (
        len(text_blocks) >= 1
    ), f"Expected at least 1 text block, got {len(text_blocks)}"
    print(f"  Session: {captured_session_id}")
    print("  PASS\n")

    return captured_session_id


async def test_resume_session(claude_session_id: str):
    """Resume a session and verify context is preserved."""
    print("=== E2E Test 2: Resume session ===\n")

    blocks: list = []
    done_reason: str | None = None
    error_msg: str | None = None

    async def on_block(block):
        if isinstance(block, TextBlock):
            print(f"  [block] text: {block.text[:200]}")
        blocks.append(block)

    async def on_done(reason: str):
        nonlocal done_reason
        done_reason = reason

    async def on_error(err: str):
        nonlocal error_msg
        error_msg = err
        print(f"  [error] {err}")

    runner = AgentRunner()
    await runner.run(
        session_id="test-e2e-2",
        msg_id="test-msg-2",
        user_id="test-user",
        user_message="What is my secret code?",
        note_context="",
        claude_session_id=claude_session_id,
        on_block=on_block,
        on_session_id=lambda _: asyncio.sleep(0),
        on_done=on_done,
        on_error=on_error,
    )

    print()
    assert error_msg is None, f"Got unexpected error: {error_msg}"
    assert done_reason == "end_turn"

    text_blocks = [b for b in blocks if isinstance(b, TextBlock)]
    full_text = " ".join(b.text for b in text_blocks)
    assert (
        "ALPHA-42" in full_text.upper() or "alpha-42" in full_text.lower()
    ), f"Expected response to contain ALPHA-42, got: {full_text}"
    print(f'  Response: "{full_text}"')
    print("  PASS\n")


async def test_restore(claude_session_id: str):
    """Restore history from a session."""
    print("=== E2E Test 3: Restore history ===\n")

    history = AgentRunner.restore(claude_session_id)
    print(f"  Restored {len(history)} messages")

    assert (
        len(history) >= 2
    ), f"Expected at least 2 messages (user+assistant), got {len(history)}"

    # First message should be user
    assert history[0]["role"] == "user"
    assert "ALPHA-42" in history[0]["blocks"][0]["content"]

    # Should have at least one assistant message
    assistant_msgs = [m for m in history if m["role"] == "assistant"]
    assert len(assistant_msgs) >= 1

    for msg in history:
        role = msg["role"]
        block_types = [b["type"] for b in msg["blocks"]]
        preview = msg["blocks"][0].get("content", "")[:60]
        print(f'  [{role}] blocks={block_types}  "{preview}"')

    print("  PASS\n")


async def main():
    session_id = await test_new_session()
    await test_resume_session(session_id)
    await test_restore(session_id)
    print("All e2e tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
