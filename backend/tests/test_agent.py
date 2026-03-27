"""Quick smoke test for claude_agent_sdk query."""

import asyncio

from claude_agent_sdk import ClaudeAgentOptions, query


async def test_basic_query():
    print("=== Test 1: basic query (no tools, no thinking) ===")
    async for msg in query(
        prompt="Say hi in 3 words",
        options=ClaudeAgentOptions(
            model="claude-sonnet-4-6",
            max_turns=1,
        ),
    ):
        print(
            f"  type={type(msg).__name__}"
            f"  role={getattr(msg, 'role', None)}"
            f"  stop={getattr(msg, 'stop_reason', None)}"
        )
        if hasattr(msg, "content"):
            for b in msg.content:
                btype = getattr(b, "type", "?")
                text = getattr(b, "text", "")
                print(f"    block: {btype} = {str(text)[:120]}")
    print("  DONE\n")


async def test_with_thinking():
    print("=== Test 2: with adaptive thinking ===")
    async for msg in query(
        prompt="What is 2+2?",
        options=ClaudeAgentOptions(
            model="claude-sonnet-4-6",
            thinking={"type": "adaptive"},
            max_turns=1,
        ),
    ):
        print(
            f"  type={type(msg).__name__}"
            f"  role={getattr(msg, 'role', None)}"
            f"  stop={getattr(msg, 'stop_reason', None)}"
        )
        if hasattr(msg, "content"):
            for b in msg.content:
                btype = getattr(b, "type", "?")
                text = getattr(b, "text", "") or getattr(b, "thinking", "")
                print(f"    block: {btype} = {str(text)[:120]}")
    print("  DONE\n")


async def main():
    await test_basic_query()
    await test_with_thinking()


if __name__ == "__main__":
    asyncio.run(main())
