// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type {
  AgentConfigPayload,
  AgentMode,
  AgentPublic,
} from "../types";

/**
 * Modal for editing (or adding) an entry in `agents.yaml`. Save posts to
 * `/api/agents/config`.
 *
 * Post reshape-agents-yaml-mode-roles: the form models the new schema:
 *
 *   - `mode` (single-prompt | live-shell) — spawn behavior
 *   - `roles[]` — dispatch labels (multi-select)
 *   - `prompts` — per-role prompt overrides (one textarea per role)
 *
 * The Manager singleton constraint still holds: at most one agent may
 * include `manager` in `roles`. Manager roles force `mode: live-shell`.
 */

const ROLE_OPTIONS = ["propose", "code", "review", "verify", "manager", "other"] as const;

// Client-side mirror of server/agents/registry.ts BUILT_IN_ROLE_PROMPTS.
// Keep in sync — this is only shown in the modal as a placeholder /
// preview; the server's version is what actually kicks in when the
// agent has no `prompts.<role>` entry.
const BUILT_IN_ROLE_PROMPTS: Readonly<Record<string, string>> = {
  propose: "/opsx:propose ${change_id}",
  code: "/opsx:apply ${change_id}",
  review: "/ithy-opsx:review ${change_id}",
  verify: "/ithy-opsx:verify ${change_id}",
  manager: "/ithy-opsx:dispatch",
};

type Props = {
  /** `AgentPublic` = edit mode with the row's data;
   *  `"new"` = add mode (fields default; name auto-generated on submit). */
  seed: AgentPublic | "new";
  /** Existing agent names — used by the Add-mode auto-namer to avoid
   *  collisions (appends `-2`, `-3`, ... on conflict). */
  existingNames: string[];
  /** Name of the currently-configured manager, if any. Used to hide
   *  `manager` from the roles multi-select in Add mode so users can't
   *  create a second one (Manager singleton). */
  existingManagerName: string | null;
  /** Optional Add-mode prefill (add-agents-tab-manager-section):
   *  populate all form fields from this seed while still treating the
   *  modal as Add mode. */
  addModePrefill?: AgentPublic | null;
  onCancel: () => void;
  onSubmit: (payload: AgentConfigPayload) => Promise<void>;
};

export function AgentConfigModal({
  seed,
  existingNames,
  existingManagerName,
  addModePrefill,
  onCancel,
  onSubmit,
}: Props) {
  const agmsg = useStore((s) => s.agmsg);
  const isAdd = seed === "new";
  const initial = useMemo(() => {
    if (seed === "new" && addModePrefill) {
      // Prefill from Manager section shortcut. Keep name empty — the
      // auto-namer at submit time picks "manager".
      return { ...deriveInitialForm(addModePrefill), name: "" };
    }
    return deriveInitialForm(seed);
  }, [seed, addModePrefill]);
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Advanced fields (Specialties, Concurrency, Dedicated, Description)
  // start collapsed to reduce visual noise. Any non-default value on
  // those fields auto-expands the section on open so users editing
  // existing agents can see what they're editing.
  const hasNonDefaultAdvanced = !!initial.description;
  const [showAdvanced, setShowAdvanced] = useState(hasNonDefaultAdvanced);

  useEffect(() => {
    setForm(initial);
    setError(null);
    setFieldErrors({});
  }, [initial]);

  // The Manager section's `[Declare in agents.yaml]` shortcut is the ONLY
  // Add-mode entry point for `manager`. Edit mode on the existing manager
  // keeps `manager` selectable so the user can reconfigure without losing
  // the role.
  //
  // Defensive access: `seed.roles` may be undefined when the server hasn't
  // yet restarted with the reshape's registry changes — fall back to the
  // deprecated scalar `seed.role` in that case so the Modal renders
  // instead of crashing during hydration.
  const isEditingManager =
    seed !== "new" &&
    (Array.isArray(seed.roles)
      ? seed.roles.includes("manager")
      : seed.role === "manager");
  const isDeclaringManager =
    Array.isArray(addModePrefill?.roles)
      ? addModePrefill!.roles.includes("manager")
      : addModePrefill?.role === "manager";
  const managerSelectable =
    isEditingManager || isDeclaringManager || existingManagerName === null;
  const availableRoles = ROLE_OPTIONS.filter(
    (r) => r !== "manager" || managerSelectable,
  );

  const includesManager = form.roles.includes("manager");

  const toggleRole = (role: string) => {
    setForm((f) => {
      const has = f.roles.includes(role);
      if (has) {
        if (f.roles.length === 1) return f; // never empty
        return { ...f, roles: f.roles.filter((r) => r !== role) };
      }
      return { ...f, roles: [...f.roles, role] };
    });
  };

  const setPromptForRole = (role: string, value: string) => {
    setForm((f) => ({ ...f, prompts: { ...f.prompts, [role]: value } }));
  };

  const resolvedPromptForRole = (role: string): { source: string; value: string } => {
    const local = form.prompts[role]?.trim();
    if (local) return { source: "custom", value: local };
    const builtIn = BUILT_IN_ROLE_PROMPTS[role];
    if (builtIn) return { source: "built-in", value: builtIn };
    return { source: "none", value: "" };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    // Name is not user-typed anymore — auto-generated on submit. No
    // per-field validation needed.
    if (form.roles.length === 0) {
      errs.roles = "at least one role required";
    }
    if (!form.command.trim()) {
      errs.command = "command required";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const prompts: Record<string, string> = {};
    for (const [role, value] of Object.entries(form.prompts)) {
      const trimmed = value.trim();
      if (trimmed && form.roles.includes(role)) prompts[role] = trimmed;
    }

    // Manager entries and agmsg-enabled projects run live-shell mode.
    // Mode is automatically derived from agmsg state so users don't have
    // to manually toggle single-prompt vs live-shell.
    const managerLocked = includesManager;
    const effectiveRoles = managerLocked ? ["manager"] : form.roles;
    const effectiveMode: AgentMode = (managerLocked || agmsg !== null) ? "live-shell" : "single-prompt";
    // Name resolution:
    //   - Edit mode: keep the seed's name (form.name is preloaded from it)
    //   - Add mode + Manager: force "manager" (singleton, no collision)
    //   - Add mode + Worker: auto-derived from runtime/command + role,
    //     de-duplicated against existingNames
    const effectiveName = !isAdd
      ? form.name.trim()
      : managerLocked
        ? "manager"
        : autoNameForWorker(form, existingNames);

    const payload: AgentConfigPayload = {
      action: "upsert",
      name: effectiveName,
      roles: effectiveRoles,
      mode: effectiveMode,
      prompts: Object.keys(prompts).length > 0 ? prompts : undefined,
      description: form.description.trim() || undefined,
    };
    if (form.command.trim()) {
      payload.command = form.command.trim();
      payload.args = form.args
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal agent-config-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {isAdd
            ? `Add agent — ${
                includesManager ? "manager" : autoNameForWorker(form, existingNames)
              }`
            : `Edit agent — ${form.name}`}
          {includesManager && (
            <span className="agent-config-manager-tag" title="Manager entry — one Terminal-panel PTY session, always live-shell">
              Manager
            </span>
          )}
        </h3>
        <form onSubmit={submit}>
          <div className="agent-config-body">

          {/* Manager entries: Roles / Mode / Runtime are fixed and hidden.
              Roles is always [manager], Mode is always live-shell, and
              Manager never inherits from a runtime block. Workers show
              all three. */}
          {!includesManager && (
            <fieldset className="agent-config-field agent-config-roles-multi">
              <legend>
                Roles{" "}
                <span className="muted">
                  (dispatch labels this agent can receive — pick one or more)
                </span>
              </legend>
              <div className="agent-config-role-chips">
                {availableRoles.map((r) => {
                  const selected = form.roles.includes(r);
                  return (
                    <label
                      key={r}
                      className={
                        selected
                          ? "agent-config-role-chip agent-config-role-chip-on"
                          : "agent-config-role-chip"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRole(r)}
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
              {fieldErrors.roles && (
                <span className="form-field-error">{fieldErrors.roles}</span>
              )}
            </fieldset>
          )}




          <label className="agent-config-field">
            <span>Command</span>
            <input
              type="text"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="e.g. claude"
            />
            {fieldErrors.command && (
              <span className="form-field-error">{fieldErrors.command}</span>
            )}
          </label>
          <label className="agent-config-field">
            <span>Args (whitespace-separated)</span>
            <input
              type="text"
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
              placeholder="e.g. --dangerously-skip-permissions"
            />
          </label>

          <fieldset className="agent-config-field agent-config-prompts">
            <legend>
              {includesManager ? (
                <>
                  Prompt{" "}
                  <span className="muted">
                    (typed into the PTY after Manager boots — leave blank for the built-in <code>/opsx:manage</code>)
                  </span>
                </>
              ) : (
                <>
                  Prompts{" "}
                  <span className="muted">
                    (per-role override — leave blank to use built-in default)
                  </span>
                </>
              )}
            </legend>
            {form.roles.map((role) => {
              const resolved = resolvedPromptForRole(role);
              return (
                <label key={role} className="agent-config-prompt-row">
                  <span className="agent-config-prompt-label">
                    Prompt for role: <code>{role}</code>
                  </span>
                  <textarea
                    value={form.prompts[role] ?? ""}
                    rows={2}
                    onChange={(e) => setPromptForRole(role, e.target.value)}
                    placeholder={
                      resolved.source === "none"
                        ? "no default — required for this role"
                        : `default: ${resolved.value}`
                    }
                  />
                  <span className="agent-config-prompt-chain-hint muted">
                    {resolved.source === "custom" && "Custom override active"}
                    {resolved.source === "built-in" &&
                      `Built-in default → ${resolved.value}`}
                    {resolved.source === "none" &&
                      "No built-in default — you MUST fill this in for dispatch to succeed"}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* Advanced options — collapsed by default. Specialties,
              Concurrency, Dedicated, Description. Manager entries only
              expose Description (the rest are irrelevant). */}
          <div className="agent-config-advanced">
            <button
              type="button"
              className="agent-config-advanced-toggle"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "▾" : "▸"} Advanced options
            </button>
            {showAdvanced && (
              <div className="agent-config-advanced-body">
                <label className="agent-config-field">
                  <span>Description (optional)</span>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
              </div>
            )}
          </div>

          </div>{/* /.agent-config-body — scrollable region ends */}

          {error && <div className="parse-error">⚠ {error}</div>}

          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type FormState = {
  name: string;
  roles: string[];
  mode: AgentMode;
  command: string;
  args: string;
  prompts: Record<string, string>;
  description: string;
};

/**
 * Derive a worker agent's name from its form state. Never called for
 * Manager (which is hard-coded to "manager") and never called in Edit
 * mode (which keeps the seed's name). Result is guaranteed kebab-case
 * and unique against `existingNames` (collision → `-2`, `-3`, ...).
 */
function autoNameForWorker(form: FormState, existingNames: string[]): string {
  const commandBase = form.command
    ? kebabify(
        form.command
          .trim()
          .split(/[/\\]/)
          .pop()!
          .replace(/\.(exe|bat|cmd|sh)$/i, ""),
      )
    : "";
  const base = commandBase || form.roles[0] || "agent";
  const soleRole =
    form.roles.length === 1 && form.roles[0] !== base ? form.roles[0] : "";
  const candidate = kebabify(soleRole ? `${base}-${soleRole}` : base) || "agent";
  return uniquify(candidate, existingNames);
}

function kebabify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniquify(candidate: string, existingNames: string[]): string {
  if (!existingNames.includes(candidate)) return candidate;
  let n = 2;
  while (existingNames.includes(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
}

function deriveInitialForm(seed: AgentPublic | "new"): FormState {
  if (seed === "new") {
    return {
      name: "",
      roles: ["code"],
      mode: "single-prompt",
      command: "",
      args: "",
      prompts: {},
      description: "",
    };
  }
  // Defensive read: the server may still be running the pre-reshape
  // registry, in which case `roles` / `mode` / `prompts` are undefined
  // on the wire. Fall back to the deprecated scalar fields so the Modal
  // renders instead of throwing during hydration.
  const rolesFromSeed =
    Array.isArray(seed.roles) && seed.roles.length > 0
      ? [...seed.roles]
      : seed.role
        ? [seed.role]
        : ["code"];
  const modeFromSeed =
    seed.mode ?? (rolesFromSeed.includes("manager") ? "live-shell" : "single-prompt");
  const promptsFromSeed: Record<string, string> = { ...(seed.prompts ?? {}) };
  if (Object.keys(promptsFromSeed).length === 0 && seed.initialInput) {
    promptsFromSeed[rolesFromSeed[0]] = seed.initialInput;
  } else if (Object.keys(promptsFromSeed).length === 0 && seed.prompt) {
    promptsFromSeed[rolesFromSeed[0]] = seed.prompt;
  }
  return {
    name: seed.name,
    roles: rolesFromSeed,
    mode: modeFromSeed,
    command: seed.command ?? "",
    args: (seed.args ?? []).join(" "),
    prompts: promptsFromSeed,
    description: seed.description ?? "",
  };
}
