# Agent Kit MCP Server

This package contains the Agent Kit MCP server used by the Agent Kit plugin manifests.

## Install

```bash
npm install -g @hanhnd/agent-kit
```

Or run it without a global install:

```bash
npx -y @hanhnd/agent-kit@latest
```

## MCP Configuration

Claude Code and Codex plugin manifests already use this package:

```json
{
  "kit-agents": {
    "command": "npx",
    "args": ["-y", "@hanhnd/agent-kit@latest"]
  }
}
```

## API Token Scopes

Integration tools call the Atlassian REST APIs with scoped API tokens. Create each token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) ("Create API token with scopes") and grant the scopes below.

| Token                  | Scopes                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `BITBUCKET_API_TOKEN`  | `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`, `read:repository:bitbucket`, `read:workspace:bitbucket`, `read:user:bitbucket` |
| `JIRA_API_TOKEN`       | `read:jira-work`                                                                                                               |
| `CONFLUENCE_API_TOKEN` | `read:page:confluence`                                                                                                         |

Per tool:

| Tool                            | Scopes                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `kit_get_bitbucket_pr`          | `read:pullrequest:bitbucket`; `read:repository:bitbucket` for the diff (the PR diff redirects to the repository diff)         |
| `kit_get_bitbucket_pr_comments` | `read:pullrequest:bitbucket`                                                                                                  |
| `kit_create_bitbucket_pr`       | `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket`; `read:workspace:bitbucket` for reviewers given by name; `read:user:bitbucket` to skip the PR author |
| `kit_find_bitbucket_reviewers`  | `read:workspace:bitbucket`; `read:user:bitbucket` to flag the PR author                                                       |
| `kit_jira_get_ticket`           | `read:jira-work`                                                                                                              |
| `kit_confluence_get_page`       | `read:page:confluence`                                                                                                        |

A missing scope surfaces as a 401/403; the error message lists the scopes the tool needs.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @hanhnd/agent-kit
```

From this directory:

```bash
npm run build
```

The source lives in `src/` and the published binary is `dist/kit-server.js`.

## Publishing

Publish the MCP package from the repository root:

```bash
npm run publish:mcp
```

That script runs `npm publish --workspace @hanhnd/agent-kit`, so npm publishes this `mcp/` package instead of the plugin bundle under `plugins/agent-kit`.
