from claude_agent_sdk import tool


@tool(
    name="search_notes",
    description=(
        "Search the user's notes by keyword."
        " Returns matching note titles and snippets."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
        },
        "required": ["query"],
    },
)
async def search_notes(query: str) -> dict:
    # Stub — real Supabase full-text search implemented in F8
    print(f"[tools] search_notes called: {query!r}")
    return {"notes": []}
