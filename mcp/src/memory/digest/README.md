# Conversation Digest

Conversation digesting extracts temporary project memory from archived conversations as provisional wiki pages.
The provider emits Markdown directly so broken JSON or paraphrased evidence cannot block temporary recall.

Before model generation, input is treated as Memory Kit's already-exported conversation text. Provider-specific transcript formats, tool-call stripping, and conversation normalization belong to the Memory Kit plugin export path, not this MCP digest package. The MCP digest layer only applies a bounded character window before passing the export to the local model. The default context window and timeout are intentionally bounded for CPU latency; use `--max-input-chars` and `--timeout-ms` only when a larger transcript slice is worth the slower run.

If the local model fails to load or times out, `digest-file` fails. The digest content must come from the configured model; the CLI does not substitute its own summary.

Digest pages are written under `wiki/compiled/provisional/conversation-digests` by default. Filenames are content-hash based, so the same conversation is not reprocessed repeatedly. They are searchable after indexing, but `/wiki compile` remains the authoritative path and should remove provisional digest pages after compiling the raw conversations into durable wiki pages.

Initialize the local model explicitly:

```sh
agent-kit-cli memory digest-init --model qwen2.5-0.5b-instruct-q4
```

Generate a page-shaped digest for one archived conversation:

```sh
agent-kit-cli memory digest-file --input .agent-kit/wiki/archive/conversations/conv_2026-05-19T00-52-23-727Z.md --model qwen2.5-1.5b-instruct-q4
```
