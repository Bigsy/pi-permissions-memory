# pi-permissions-memory

A plain Git Pi extension for permission prompts with memory.

It asks before risky tool use, lets you tighten the suggested wildcard before approving it, and can remember approved wildcards globally for future sessions.

Install it as a Git Pi extension.

```bash
pi install git:github.com/Bigsy/pi-permissions-memory
```

For local use:

```bash
pi install /path/to/pi-permissions-memory
```

## Features

- Gate Pi tool calls with `allow`, `ask`, and `deny` rules.
- Gate bash commands with wildcard patterns.
- Gate MCP tools, skills, file tools, and external-directory access.
- Approve once.
- Approve for the current session.
- Approve globally and write the approval to Pi config.
- Edit the suggested wildcard before approving, with the editor prefilled.

## Configuration

Global config lives at:

```text
~/.pi/agent/extensions/pi-permission-system/config.json
```

Project config lives at:

```text
<project>/.pi/extensions/pi-permission-system/config.json
```

Example:

```json
{
  "debugLog": false,
  "permissionReviewLog": true,
  "yoloMode": false,
  "permission": {
    "read": {
      "*": "allow"
    },
    "bash": {
      "rm -rf *": "deny",
      "sudo *": "ask",
      "git status*": "allow"
    },
    "external_directory": "ask"
  }
}
```

Permission states:

| State | Meaning |
| --- | --- |
| `allow` | Run without prompting. |
| `ask` | Show a permission dialog. |
| `deny` | Block the request. |

## Permission dialog

When a request matches an `ask` rule, the dialog can show:

- `Yes`
- `Yes, allow bash "git *" for this session`
- `Yes, allow bash "git *" always (global config)`
- `Edit wildcard approval pattern`
- `No`
- `No, provide reason`

## Editing wildcard approvals

The extension suggests a wildcard. If it is too broad, choose:

```text
Edit wildcard approval pattern
```

An editor opens with the suggested wildcard already filled in.

Example:

```text
Suggested: git *
Edited:    git status *
```

After editing, choose the session approval or global approval option. The edited wildcard is what gets stored.

## Session approvals

Session approvals are temporary. They are kept in memory and cleared when the Pi session shuts down.

Example:

```text
Yes, allow bash "git status *" for this session
```

## Global approvals

Global approvals are persistent. They add an `allow` rule to:

```text
~/.pi/agent/extensions/pi-permission-system/config.json
```

Example global approval:

```text
bash: git status *
```

Resulting config entry:

```json
{
  "permission": {
    "bash": {
      "git status *": "allow"
    }
  }
}
```

## Suggested patterns

| Surface | Request | Suggested pattern |
| --- | --- | --- |
| bash | `git status --short` | `git status *` |
| MCP | `server:tool` | `server:*` |
| skill | `review` | `review` |
| external directory | `/tmp/file.txt` | `/tmp/*` |
| tool | `read`, `write`, `edit` | tool-level wildcard |

Bash suggestions are arity-aware, so common commands can keep useful prefixes instead of always collapsing to only the first word.

## Local symlink install

Pi also auto-loads extensions from:

```text
~/.pi/agent/extensions/<name>/index.ts
```

So you can symlink this repo into Pi:

```bash
ln -s /path/to/pi-permissions-memory ~/.pi/agent/extensions/pi-permissions-memory
```

Then run `/reload` in Pi.

## Notes

- Extensions run with your user permissions. Only install code you trust.
- Global approvals intentionally modify your Pi permission config.
- Project rules can still override or add stricter rules depending on scope and pattern order.

## License

MIT
