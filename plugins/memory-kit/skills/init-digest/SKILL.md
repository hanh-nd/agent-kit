---
name: init-digest
description: Optional local conversation digest setup for Memory Kit. Runs only when explicitly requested.
providers:
  claude:
    disable-model-invocation: true
    context: fork
---

# Memory Init

Initialize optional local conversation digesting for Memory Kit.

## Rules

- Call `kit_memory_digest_init` with the requested `model_id` when the user provides one; otherwise call it with no arguments to use the default pinned model.
- Report whether initialization succeeded and include any returned error.

## Output

Keep the response short:

- initialized model id
- provider
- whether `/wiki compile` is still required for authoritative wiki memory
