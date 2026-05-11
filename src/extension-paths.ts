import { join } from "node:path";
import { getGlobalLogsDir } from "./config-paths";

/**
 * Immutable path constants derived from `agentDir` at construction time.
 *
 * Computed once at startup in `computeExtensionPaths()` and embedded into
 * `ExtensionRuntime`. Later refactorings (#129 PermissionSession, #130
 * handler classes) consume this as a single dep instead of individual fields.
 */
export interface ExtensionPaths {
  readonly agentDir: string;
  readonly sessionsDir: string;
  readonly subagentSessionsDir: string;
  readonly forwardingDir: string;
  readonly globalLogsDir: string;
  /** Static Pi infrastructure directories used for external-directory read auto-allow. */
  readonly piInfrastructureDirs: readonly string[];
}

/**
 * Compute all immutable path constants from `agentDir`.
 *
 * Call this once at extension startup, not at module scope.
 */
export function computeExtensionPaths(agentDir: string): ExtensionPaths {
  const sessionsDir = join(agentDir, "sessions");
  const subagentSessionsDir = join(agentDir, "subagent-sessions");
  const forwardingDir = join(sessionsDir, "permission-forwarding");
  const globalLogsDir = getGlobalLogsDir(agentDir);

  const piInfrastructureDirs: string[] = [agentDir, join(agentDir, "git")];

  return {
    agentDir,
    sessionsDir,
    subagentSessionsDir,
    forwardingDir,
    globalLogsDir,
    piInfrastructureDirs,
  };
}
