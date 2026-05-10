# pi-permissions-memory

Interactive permission gates for [pi](https://github.com/earendil-works/pi) with learn-as-you-go auto-approve memory.

Every time pi wants to run a tool (bash, write, edit, etc.), this extension checks against saved rules. If there's no matching rule, it prompts you with **5 options**:

1. ✅ **Allow once** — permits this call only
2. ✅ **Allow for this session** — stores an in-memory rule until pi exits
3. ❌ **Deny** — blocks this call
4. ✅ **Always allow (project)** — saves rule to `.pi/auto-approve.json`
5. ✅ **Always allow (global)** — saves rule to `~/.pi/agent/auto-approve.json`

## How it works

- **Session rules** live in memory only and are forgotten when pi exits
- **Global rules** (`~/.pi/agent/auto-approve.json`) apply everywhere — e.g. `git status`, `bb lint`
- **Project rules** (`.pi/auto-approve.json`) apply per-repo — e.g. `bb run-web`, project-specific scripts
- Resolution order is session → project → global
- Bash commands match with glob patterns (`bb test*`, `git *`, etc.)
- Tool names match exactly (`read`, `write`, `edit`, `bash`, etc.)

## Installation

```bash
pi install git:github.com/hedworth/pi-permissions-memory
```

Or manually place in `~/.pi/agent/extensions/pi-permissions-memory/`.

## Example auto-approve.json

```json
{
  "tools": {
    "read": "allow",
    "grep": "allow",
    "find": "allow",
    "ls": "allow"
  },
  "bash": {
    "git status": "allow",
    "git diff*": "allow",
    "git log*": "allow",
    "bb lint": "allow",
    "bb test*": "allow",
    "rm *": "deny"
  }
}
```

## Policy resolution

For bash commands, patterns are checked in order and the **most specific (longest) match wins**. If multiple patterns match, the longest one takes priority.

For tools, exact name matching is used.

## License

MIT
