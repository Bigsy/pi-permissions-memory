export type PermissionDecisionState =
  | "approved"
  | "approved_for_session"
  | "approved_globally"
  | "denied"
  | "denied_with_reason";

export type PermissionPromptDecision = {
  approved: boolean;
  state: PermissionDecisionState;
  denialReason?: string;
  /** Edited wildcard pattern to record for session/global approvals. */
  approvalPattern?: string;
  /**
   * True when the decision was made automatically by yolo mode rather than
   * by an interactive user prompt. Used by handlers to emit "auto_approved"
   * rather than "user_approved" in the permissions:decision broadcast.
   */
  autoApproved?: true;
};

export interface PermissionDecisionUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  editor?(title: string, initialText?: string): Promise<string | undefined>;
}

const APPROVE_OPTION = "Yes";
const APPROVE_FOR_SESSION_OPTION = "Yes, for this session";
const APPROVE_GLOBALLY_OPTION = "Yes, always (global)";
const EDIT_PATTERN_OPTION = "Edit wildcard approval pattern";
const DENY_OPTION = "No";
const DENY_WITH_REASON_OPTION = "No, provide reason";
export function normalizePermissionDenialReason(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createDeniedPermissionDecision(
  denialReason?: string,
): PermissionPromptDecision {
  const normalizedReason = normalizePermissionDenialReason(denialReason);
  return normalizedReason
    ? {
        approved: false,
        state: "denied_with_reason",
        denialReason: normalizedReason,
      }
    : {
        approved: false,
        state: "denied",
      };
}

export function isPermissionDecisionState(
  value: unknown,
): value is PermissionDecisionState {
  return (
    value === "approved" ||
    value === "approved_for_session" ||
    value === "approved_globally" ||
    value === "denied" ||
    value === "denied_with_reason"
  );
}

export interface RequestPermissionOptions {
  /** Override the "for this session" option label (e.g. to show the suggested pattern). */
  sessionLabel?: string;
  /** Override the global approval option label (e.g. to show the suggested pattern). */
  globalLabel?: string;
  /** Wildcard pattern backing the session/global approval labels. */
  approvalPattern?: string;
}

export async function requestPermissionDecisionFromUi(
  ui: PermissionDecisionUi,
  title: string,
  message: string,
  options?: RequestPermissionOptions,
): Promise<PermissionPromptDecision> {
  let approvalPattern = options?.approvalPattern;

  while (true) {
    const sessionOption = options?.sessionLabel ?? APPROVE_FOR_SESSION_OPTION;
    const globalOption = options?.globalLabel ?? APPROVE_GLOBALLY_OPTION;
    const decisionOptions = [
      APPROVE_OPTION,
      sessionOption,
      ...(approvalPattern ? [globalOption, EDIT_PATTERN_OPTION] : []),
      DENY_OPTION,
      DENY_WITH_REASON_OPTION,
    ] as const;

    const selected = await ui.select(`${title}\n${message}`, [
      ...decisionOptions,
    ]);

    if (selected === EDIT_PATTERN_OPTION && approvalPattern) {
      const edited = ui.editor
        ? await ui.editor(
            `${title}\nEdit wildcard approval pattern`,
            approvalPattern,
          )
        : await ui.input(
            `${title}\nEdit wildcard approval pattern\nCurrent: ${approvalPattern}`,
            approvalPattern,
          );
      const trimmed = edited?.trim();
      if (trimmed) {
        approvalPattern = trimmed;
        options = {
          ...options,
          sessionLabel: sessionOption.replace(/"[^"]*"/, `"${trimmed}"`),
          globalLabel: globalOption.replace(/"[^"]*"/, `"${trimmed}"`),
          approvalPattern,
        };
      }
      continue;
    }

    if (selected === APPROVE_OPTION) {
      return {
        approved: true,
        state: "approved",
      };
    }

    if (selected === sessionOption) {
      return {
        approved: true,
        state: "approved_for_session",
        approvalPattern,
      };
    }

    if (selected === globalOption) {
      return {
        approved: true,
        state: "approved_globally",
        approvalPattern,
      };
    }

    if (selected === DENY_WITH_REASON_OPTION) {
      const denialReason = normalizePermissionDenialReason(
        await ui.input(
          `${title}\nShare why this request was denied (optional).`,
          "Reason shown back to the agent",
        ),
      );

      return createDeniedPermissionDecision(denialReason);
    }

    return createDeniedPermissionDecision();
  }
}
