---
name: recall
description: "Search persistent memory for context relevant to the current question.
  Use this proactively when the user asks about past decisions, prior conversations,
  or context from previous sessions."
---

# Memory Recall

Search memory for context relevant to the user's question.

## Rules

If no relevant memories are found, respond: "No relevant memories found.", do not hallucinate or do your own finding for memories.

## Steps

1. If the user asks a temporal or recency question (for example, "what did we do last session?", "recent work", "what changed lately?"), call `kit_memory_recent`.
   - Use `n` when the user asks for a specific count.
   - Use `source_type` only when the user explicitly narrows the request to a source type such as `digest`, `concept`, `entity`, `preference`, or `wiki`.
2. Otherwise, call `kit_memory_search` for factual or semantic memory lookup.
   - Convert the user's request into concise search keywords only.
   - Remove stop words and filler words before sending the query.
   - Keep important names, project terms, ticket IDs, feature names, and technical nouns.
3. Review the returned results — assess relevance using score, heading, source, and content.
4. If results are relevant, return a concise summary citing source file and date when available.
5. If no relevant results, respond: "No relevant memories found."
