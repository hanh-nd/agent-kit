---
name: recall
description: "Search persistent memory for context relevant to the current question.
  Use this proactively when the user asks about past decisions, prior conversations,
  or context from previous sessions."
providers:
  claude:
    context: fork
---

# Memory Recall

Search memory for context relevant to the user's question.

## Rules

If no relevant memories are found, respond: "No relevant memories found.", do not hallucinate or do your own finding for memories.

## Steps

1. Call `kit_memory_search` with the user's question (or a concise reformulation) as the query.
2. Review the returned results — assess relevance using score, heading, and content.
3. If results are relevant, return a concise summary citing source file and date.
4. If no relevant results, respond: "No relevant memories found."
