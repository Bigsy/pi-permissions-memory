import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isPermissionState, toRecord } from "./common";
import { stripJsonComments } from "./config-loader";
import { getGlobalConfigPath } from "./config-paths";
import type { FlatPermissionConfig, PermissionState } from "./types";

interface MutablePermissionConfig {
  permission?: FlatPermissionConfig;
  [key: string]: unknown;
}

function readConfig(path: string): MutablePermissionConfig {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(stripJsonComments(raw));
    return toRecord(parsed) as MutablePermissionConfig;
  } catch {
    return {};
  }
}

function normalizePermissionValue(
  value: unknown,
): PermissionState | Record<string, PermissionState> | undefined {
  if (typeof value === "string" && isPermissionState(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;

  const out: Record<string, PermissionState> = {};
  for (const [pattern, action] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (isPermissionState(action)) out[pattern] = action;
  }
  return out;
}

function normalizePermission(permission: unknown): FlatPermissionConfig {
  const out: FlatPermissionConfig = {};
  if (
    !permission ||
    typeof permission !== "object" ||
    Array.isArray(permission)
  ) {
    return out;
  }

  for (const [surface, value] of Object.entries(
    permission as Record<string, unknown>,
  )) {
    const normalized = normalizePermissionValue(value);
    if (normalized !== undefined) out[surface] = normalized;
  }
  return out;
}

/** Persist a user-approved allow rule to the global pi-permission-system config. */
export function approveGlobalRule(
  agentDir: string,
  surface: string,
  pattern: string,
): void {
  const configPath = getGlobalConfigPath(agentDir);
  const config = readConfig(configPath);
  const permission = normalizePermission(config.permission);
  const current = permission[surface];

  const map: Record<string, PermissionState> =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...current }
      : typeof current === "string"
        ? { "*": current }
        : {};

  map[pattern] = "allow";
  permission[surface] = map;
  config.permission = permission;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}
