"""Unit tests for _WsAdapter in main.py."""

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _WsAdapter  # noqa: E402

# ── Helpers ───────────────────────────────────────────────────────────────────


def make_fake_ws(*messages):
    """Return a mock curl_cffi ws that yields (data, flags) tuples."""
    ws = MagicMock()
    ws.send_str = AsyncMock()
    ws.recv = AsyncMock(side_effect=[(m, 1) for m in messages])
    return ws


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_send_calls_send_str():
    """send() should delegate to the underlying ws.send_str()."""
    fake_ws = make_fake_ws()
    adapter = _WsAdapter(fake_ws)

    await adapter.send('{"type":"ping"}')

    fake_ws.send_str.assert_awaited_once_with('{"type":"ping"}')


async def test_recv_decodes_bytes():
    """recv() should decode bytes to str."""
    fake_ws = make_fake_ws(b'{"type":"ok"}')
    adapter = _WsAdapter(fake_ws)

    result = await adapter.recv()

    assert result == '{"type":"ok"}'


async def test_recv_passes_str_through():
    """recv() should return str messages unchanged."""
    fake_ws = make_fake_ws('{"type":"ok"}')
    adapter = _WsAdapter(fake_ws)

    result = await adapter.recv()

    assert result == '{"type":"ok"}'


async def test_aiter_yields_all_messages():
    """async for should yield all messages until an exception stops iteration."""
    fake_ws = MagicMock()
    fake_ws.send_str = AsyncMock()
    # After two messages, raise to simulate connection close
    fake_ws.recv = AsyncMock(
        side_effect=[(b"msg1", 1), (b"msg2", 1), ConnectionResetError()]
    )
    adapter = _WsAdapter(fake_ws)

    collected = []
    try:
        async for raw in adapter:
            collected.append(raw)
    except ConnectionResetError:
        pass

    assert collected == ["msg1", "msg2"]


async def test_aiter_propagates_exception():
    """Exceptions from recv() should propagate out of async for."""
    fake_ws = MagicMock()
    fake_ws.recv = AsyncMock(side_effect=ConnectionResetError("closed"))
    adapter = _WsAdapter(fake_ws)

    with_exception = False
    try:
        async for _ in adapter:
            pass
    except ConnectionResetError:
        with_exception = True

    assert with_exception, "Expected ConnectionResetError to propagate"


async def main():
    print("=== test_ws_adapter.py ===\n")
    await test_send_calls_send_str()
    print("  PASS: send() calls send_str()")
    await test_recv_decodes_bytes()
    print("  PASS: recv() decodes bytes to str")
    await test_recv_passes_str_through()
    print("  PASS: recv() passes str through unchanged")
    await test_aiter_yields_all_messages()
    print("  PASS: async for yields all messages")
    await test_aiter_propagates_exception()
    print("  PASS: exception propagates out of async for")
    print("\nAll tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
