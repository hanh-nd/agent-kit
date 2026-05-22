---
name: init-digest
description: Optional local conversation digest setup for Memory Kit. Runs only when explicitly requested.
---

# Memory Init

Initialize optional local conversation digesting for Memory Kit.

## Rules

- This is optional. `/wiki compile` remains the authoritative memory path.
- Do not imply normal Memory Kit use requires model setup.
- Do not run this during startup hooks or `/wiki compile`.
- Call `kit_memory_digest_init` with the requested `model_id` when the user provides one; otherwise call it with no arguments to use the default pinned model.
- Report whether initialization succeeded and include any returned error.

## Output

Keep the response short:

- initialized model id
- provider
- whether `/wiki compile` is still required for authoritative wiki memory
