/**
 * pi-permissions-memory
 *
 * Interactive permission gates for pi with learn-as-you-go auto-approve memory.
 * Prompts the user when a tool call doesn't match any saved rule,
 * and lets them save new rules to session, project, or global config.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// No external deps — simple glob matcher below

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Policy {
  tools?: Record<string, "allow" | "deny">;
  bash?: Record<string, "allow" | "deny">;
}

interface Policies {
  session: Policy;
  global: Policy;
  project: Policy;
}

// ---------------------------------------------------------------------------
// Policy file I/O
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const GLOBAL_POLICY_PATH = join(homedir(), ".pi", "agent", "auto-approve.json");
const PROJECT_POLICY_DIR = ".pi";
const PROJECT_POLICY_FILE = "auto-approve.json";

function loadPolicy(filePath: string): Policy {
  try {
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePolicy(filePath: string, policy: Policy): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(policy, null, 2) + "\n", "utf8");
}

function loadPolicies(cwd: string, sessionPolicy: Policy): Policies {
  return {
    session: sessionPolicy,
    global: loadPolicy(GLOBAL_POLICY_PATH),
    project: loadPolicy(join(cwd, PROJECT_POLICY_DIR, PROJECT_POLICY_FILE)),
  };
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Simple glob matcher supporting * (any chars) and ? (single char).
 * Case-insensitive. Good enough for bash command patterns like "bb test*".
 */
function matchesPattern(pattern: string, value: string): boolean {
  if (pattern.toLowerCase() === value.toLowerCase()) return true;
  if (!pattern.includes("*") && !pattern.includes("?")) return false;

  // Convert glob to regex: * → .*, ? → ., escape everything else
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") regex += ".*";
    else if (ch === "?") regex += ".";
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  try {
    return new RegExp(`^${regex}$`, "i").test(value);
  } catch {
    return false;
  }
}

/**
 * Find the best matching rule for a value in a rules map.
 * Returns the verdict or undefined if no rule matches.
 * Longest pattern wins when multiple patterns match.
 */
function findBestMatch(
  rules: Record<string, "allow" | "deny"> | undefined,
  value: string,
): "allow" | "deny" | undefined {
  if (!rules) return undefined;

  let bestPattern = "";
  let bestVerdict: "allow" | "deny" | undefined;

  for (const [pattern, verdict] of Object.entries(rules)) {
    if (matchesPattern(pattern, value)) {
      if (pattern.length > bestPattern.length) {
        bestPattern = pattern;
        bestVerdict = verdict;
      }
    }
  }

  return bestVerdict;
}

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------

type Verdict = "allow" | "deny" | "ask";

/**
 * Resolution order: session → project → global.
 * First match wins.
 */
function resolveTool(name: string, policies: Policies): Verdict {
  const sessionVerdict = findBestMatch(policies.session.tools, name);
  if (sessionVerdict) return sessionVerdict;

  const projectVerdict = findBestMatch(policies.project.tools, name);
  if (projectVerdict) return projectVerdict;

  const globalVerdict = findBestMatch(policies.global.tools, name);
  if (globalVerdict) return globalVerdict;

  return "ask";
}

function resolveBash(command: string, policies: Policies): Verdict {
  const cmd = command.trim();

  const sessionVerdict = findBestMatch(policies.session.bash, cmd);
  if (sessionVerdict) return sessionVerdict;

  const projectVerdict = findBestMatch(policies.project.bash, cmd);
  if (projectVerdict) return projectVerdict;

  const globalVerdict = findBestMatch(policies.global.bash, cmd);
  if (globalVerdict) return globalVerdict;

  return "ask";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a pattern from a bash command by replacing variable parts with *.
 * E.g. "git log --oneline -5" → "git log *"
 *      "bb test unit" → "bb test *"
 * Simple heuristic: keep the first 2 tokens, wildcard the rest.
 */
function suggestPattern(command: string): string {
  const parts = command.trim().split(/\s+/);
  if (parts.length <= 2) return command.trim();
  return parts.slice(0, 2).join(" ") + " *";
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function permissionsMemory(pi: ExtensionAPI) {
  // Full auto mode skips all prompts/rules until toggled off.
  let autoMode = false;

  // In-memory session policy — dies when pi exits
  const sessionPolicy: Policy = {};

  // Cached policies, reload on each agent start
  let policies: Policies = { session: sessionPolicy, global: {}, project: {} };

  function setAutoMode(enabled: boolean, ctx: { ui?: { notify?: (message: string, level: "info" | "warning" | "error") => void; setStatus?: (id: string, value: string | undefined) => void } }) {
    autoMode = enabled;
    ctx.ui?.setStatus?.("permissions-memory", enabled ? "permissions: auto" : undefined);
    ctx.ui?.notify?.(enabled ? "Permissions memory: full auto mode enabled" : "Permissions memory: full auto mode disabled", enabled ? "warning" : "info");
  }

  pi.registerCommand("permissions-auto", {
    description: "Toggle permissions-memory full auto mode",
    handler: async (_args, ctx) => {
      setAutoMode(!autoMode, ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+a", {
    description: "Toggle permissions-memory full auto mode",
    handler: async (ctx) => {
      setAutoMode(!autoMode, ctx);
    },
  });

  /**
   * Save a bash pattern rule to the chosen scope.
   */
  async function saveBashRule(pattern: string, scope: "session" | "project" | "global", ctx: ExtensionContext) {
    if (scope === "session") {
      sessionPolicy.bash = sessionPolicy.bash ?? {};
      sessionPolicy.bash[pattern] = "allow";
      ctx.ui.notify(`Session rule: ${pattern} → allow`, "info");
    } else if (scope === "project") {
      const projectPath = join(ctx.cwd, PROJECT_POLICY_DIR, PROJECT_POLICY_FILE);
      const policy = loadPolicy(projectPath);
      policy.bash = policy.bash ?? {};
      policy.bash[pattern] = "allow";
      savePolicy(projectPath, policy);
      policies.project = loadPolicy(projectPath);
      ctx.ui.notify(`Saved project rule: ${pattern} → allow`, "info");
    } else {
      const policy = loadPolicy(GLOBAL_POLICY_PATH);
      policy.bash = policy.bash ?? {};
      policy.bash[pattern] = "allow";
      savePolicy(GLOBAL_POLICY_PATH, policy);
      policies.global = loadPolicy(GLOBAL_POLICY_PATH);
      ctx.ui.notify(`Saved global rule: ${pattern} → allow`, "info");
    }
  }

  /**
   * Save a tool rule to the chosen scope.
   */
  async function saveToolRule(name: string, scope: "session" | "project" | "global", ctx: ExtensionContext) {
    if (scope === "session") {
      sessionPolicy.tools = sessionPolicy.tools ?? {};
      sessionPolicy.tools[name] = "allow";
      ctx.ui.notify(`Session rule: ${name} → allow`, "info");
    } else if (scope === "project") {
      const projectPath = join(ctx.cwd, PROJECT_POLICY_DIR, PROJECT_POLICY_FILE);
      const policy = loadPolicy(projectPath);
      policy.tools = policy.tools ?? {};
      policy.tools[name] = "allow";
      savePolicy(projectPath, policy);
      policies.project = loadPolicy(projectPath);
      ctx.ui.notify(`Saved project rule: ${name} → allow`, "info");
    } else {
      const policy = loadPolicy(GLOBAL_POLICY_PATH);
      policy.tools = policy.tools ?? {};
      policy.tools[name] = "allow";
      savePolicy(GLOBAL_POLICY_PATH, policy);
      policies.global = loadPolicy(GLOBAL_POLICY_PATH);
      ctx.ui.notify(`Saved global rule: ${name} → allow`, "info");
    }
  }

  /**
   * Ask the user to pick a scope for saving a rule.
   */
  async function pickScope(label: string, ctx: ExtensionContext): Promise<"session" | "project" | "global" | undefined> {
    return ctx.ui.select(`Save "${label}" where?`, [
      "This session",
      "Project (.pi/auto-approve.json)",
      "Global (~/.pi/agent/auto-approve.json)",
    ] as const).then((choice) => {
      if (choice === "This session") return "session";
      if (choice === "Project (.pi/auto-approve.json)") return "project";
      if (choice === "Global (~/.pi/agent/auto-approve.json)") return "global";
      return undefined;
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    // Clear session policy on new session
    sessionPolicy.tools = undefined;
    sessionPolicy.bash = undefined;
    policies = loadPolicies(ctx.cwd, sessionPolicy);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    // Refresh file-based policies in case they changed
    policies = loadPolicies(ctx.cwd, sessionPolicy);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (autoMode) return;
    if (!ctx.hasUI) return;

    const toolName = event.toolName;

    // --- Bash has command-level rules. Check those before generic tool rules
    // so a broad tools.bash allow cannot bypass a specific bash deny.
    if (toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      const bashVerdict = resolveBash(command, policies);

      if (bashVerdict === "allow") return;
      if (bashVerdict === "deny") {
        return { block: true, reason: `Bash command denied by policy: ${command}` };
      }

      const toolVerdict = resolveTool(toolName, policies);
      if (toolVerdict === "allow") return;
      if (toolVerdict === "deny") {
        return { block: true, reason: `Tool '${toolName}' is denied by policy` };
      }

      // "ask" — prompt the user
      const pattern = suggestPattern(command);
      const choice = await ctx.ui.select(
        `Allow bash: ${command}`,
        [
          `Allow once`,
          `Allow "${pattern}" for this session`,
          `Always allow "${pattern}" (project)`,
          `Always allow "${pattern}" (global)`,
          `Edit pattern...`,
          `Deny`,
        ],
      );

      if (choice === undefined || choice === `Deny`) {
        return { block: true, reason: `User denied: ${command}` };
      }

      if (choice === `Allow once`) return;

      if (choice === `Allow "${pattern}" for this session`) {
        await saveBashRule(pattern, "session", ctx);
        return;
      }

      if (choice === `Always allow "${pattern}" (project)`) {
        await saveBashRule(pattern, "project", ctx);
        return;
      }

      if (choice === `Always allow "${pattern}" (global)`) {
        await saveBashRule(pattern, "global", ctx);
        return;
      }

      if (choice === `Edit pattern...`) {
        const edited = await ctx.ui.input(`Edit pattern:`, pattern);
        if (!edited?.trim()) return { block: true, reason: `User cancelled pattern edit` };
        const customPattern = edited.trim();
        const scope = await pickScope(customPattern, ctx);
        if (!scope) return { block: true, reason: `User cancelled scope selection` };
        await saveBashRule(customPattern, scope, ctx);
        return;
      }

      return;
    }

    // --- Resolve tool-level policy for non-bash tools ---
    const toolVerdict = resolveTool(toolName, policies);

    if (toolVerdict === "allow") return;
    if (toolVerdict === "deny") {
      return { block: true, reason: `Tool '${toolName}' is denied by policy` };
    }

    // --- Non-bash tools with "ask" verdict ---
    const choice = await ctx.ui.select(
      `Allow tool '${toolName}'?`,
      [
        `Allow once`,
        `Allow '${toolName}' for this session`,
        `Always allow '${toolName}' (project)`,
        `Always allow '${toolName}' (global)`,
        `Deny`,
      ],
    );

    if (choice === undefined || choice === `Deny`) {
      return { block: true, reason: `User denied tool: ${toolName}` };
    }

    if (choice === `Allow once`) return;

    if (choice === `Allow '${toolName}' for this session`) {
      await saveToolRule(toolName, "session", ctx);
      return;
    }

    if (choice === `Always allow '${toolName}' (project)`) {
      await saveToolRule(toolName, "project", ctx);
      return;
    }

    if (choice === `Always allow '${toolName}' (global)`) {
      await saveToolRule(toolName, "global", ctx);
      return;
    }
  });
}
