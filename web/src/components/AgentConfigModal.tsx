// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import type {
  AgentConfigPayload,
  AgentMode,
  AgentPublic,
  RuntimeDefPublic,
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

const ROLE_OPTIONS = ["code", "review", "verify", "manager", "other"] as const;
const KEBAB_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

const BUILT_IN_ROLE_PROMPTS: Readonly<Record<string, string>> = {
  code: "/opsx:apply ${change_id}",
  review: "/opsx:review ${change_id}",
  verify: "/opsx:verify ${change_id}",
  manager: "/opsx:manage",
};

type Props = {
  /** `AgentPublic` = edit mode with the row's data (name field disabled);
   *  `"new"` = add mode (name field editable + empty defaults). */
  seed: AgentPublic | "new";
  runtimes: RuntimeDefPublic[];
  /** Name of the currently-configured manager, if any. Used to hide
   *  `manager` from the roles multi-select in Add mode so users can't
   *  create a second one (Manager singleton). */
  existingManagerName: string | null;
  /** Optional Add-mode prefill (add-agents-tab-manager-section):
   *  populate all form fields except `name` from this seed while still
   *  treating the modal as Add mode. */
  addModePrefill?: AgentPublic | null;
  onCancel: () => void;
  onSubmit: (payload: AgentConfigPayload) => Promise<void>;
};

export function AgentConfigModal({
  seed,
  runtimes,
  existingManagerName,
  addModePrefill,
  onCancel,
  onSubmit,
}: Props) {
  const isAdd = seed === "new";
  const initial = useMemo(() => {
    if (seed === "new" && addModePrefill) {
      return { ...deriveInitialForm(addModePrefill), name: "" };
    }
    return deriveInitialForm(seed);
  }, [seed, addModePrefill]);
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(initial);
    setError(null);
    setFieldErrors({});
  }, [initial]);

  const runtimeOptions = runtimes.map((r) => r.name);
  const selectedRuntime = runtimes.find((r) => r.name === form.runtime) ?? null;

  // The Manager section's `[Declare in agents.yaml]` shortcut is the ONLY
  // Add-mode entry point for `manager`. Edit mode on the existing manager
  // keeps `manager` selectable so the user can reconfigure without losing
  // the role.
  const isEditingManager =
    seed !== "new" && seed.roles.includes("manager");
  const isDeclaringManager = !!addModePrefill?.roles?.includes("manager");
  const managerSelectable =
    isEditingManager || isDeclaringManager || existingManagerName === null;
  const availableRoles = ROLE_OPTIONS.filter(
    (r) => r !== "manager" || managerSelectable,
  );

  const includesManager = form.roles.includes("manager");
  // Manager roles require live-shell mode. Force the toggle when manager
  // is on.
  const modeLockedToLiveShell = includesManager;
  useEffect(() => {
    if (includesManager && form.mode !== "live-shell") {
      setForm((f) => ({ ...f, mode: "live-shell" }));
    }
  }, [includesManager, form.mode]);

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

  const inheritedCommand = selectedRuntime?.command ?? "";
  const inheritedArgs = (selectedRuntime?.baseArgs ?? []).join(" ");

  const resolvedPromptForRole = (role: string): { source: string; value: string } => {
    const local = form.prompts[role]?.trim();
    if (local) return { source: "custom", value: local };
    const fromRuntime = selectedRuntime?.prompts?.[role];
    if (fromRuntime) {
      return { source: `runtime:${selectedRuntime.name}`, value: fromRuntime };
    }
    const builtIn = BUILT_IN_ROLE_PROMPTS[role];
    if (builtIn) return { source: "built-in", value: builtIn };
    return { source: "none", value: "" };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (isAdd && !KEBAB_RE.test(form.name)) {
      errs.name = "kebab-case letters, digits and hyphens only (e.g. reviewer)";
    }
    if (form.roles.length === 0) {
      errs.roles = "at least one role required";
    }
    if (!Number.isFinite(form.concurrency) || form.concurrency < 1) {
      errs.concurrency = "must be an integer ≥ 1";
    }
    if (!form.runtime && !form.command.trim()) {
      errs.command = "pick a runtime OR set a command";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const prompts: Record<string, string> = {};
    for (const [role, value] of Object.entries(form.prompts)) {
      const trimmed = value.trim();
      if (trimmed && form.roles.includes(role)) prompts[role] = trimmed;
    }

    const payload: AgentConfigPayload = {
      action: "upsert",
      name: form.name.trim(),
      roles: form.roles,
      mode: form.mode,
      prompts: Object.keys(prompts).length > 0 ? prompts : undefined,
      specialties: form.specialties
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      concurrency: form.concurrency,
      dedicated: form.dedicated,
      description: form.description.trim() || undefined,
    };
    if (form.command.trim()) {
      payload.command = form.command.trim();
      payload.args = form.args
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (form.runtime) payload.runtime = form.runtime;

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
        <h3>{isAdd ? "Add agent" : `Edit agent — ${form.name}`}</h3>
        <form onSubmit={submit}>
          <label className="agent-config-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              disabled={!isAdd}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. reviewer"
            />
            {fieldErrors.name && <span className="agent-config-error">{fieldErrors.name}</span>}
          </label>

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
              <span className="agent-config-error">{fieldErrors.roles}</span>
            )}
          </fieldset>

          <fieldset className="agent-config-field agent-config-mode">
            <legend>Mode</legend>
            <label>
              <input
                type="radio"
                name="mode"
                checked={form.mode === "single-prompt"}
                disabled={modeLockedToLiveShell}
                onChange={() => setForm({ ...form, mode: "single-prompt" })}
              />
              single-prompt{" "}
              <span className="muted">
                (headless spawn, `-p &lt;prompt&gt;`, exits on completion — Worker)
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                checked={form.mode === "live-shell"}
                onChange={() => setForm({ ...form, mode: "live-shell" })}
              />
              live-shell{" "}
              <span className="muted">
                (PTY session, prompt typed into stdin, stays alive — Manager)
              </span>
            </label>
            {modeLockedToLiveShell && (
              <span className="agent-config-hint">
                Manager roles require live-shell mode.
              </span>
            )}
          </fieldset>

          <label className="agent-config-field">
            <span>
              Runtime{" "}
              <span className="muted">
                (optional — inherit command / args / prompts from a `runtimes:` entry)
              </span>
            </span>
            <select
              value={form.runtime}
              onChange={(e) => setForm({ ...form, runtime: e.target.value })}
            >
              <option value="">— none (specify command below) —</option>
              {runtimeOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="agent-config-field">
            <span>Command</span>
            <input
              type="text"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder={
                selectedRuntime
                  ? `inherits: ${inheritedCommand}`
                  : "e.g. claude"
              }
            />
            {fieldErrors.command && (
              <span className="agent-config-error">{fieldErrors.command}</span>
            )}
          </label>
          <label className="agent-config-field">
            <span>Args (whitespace-separated)</span>
            <input
              type="text"
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
              placeholder={
                selectedRuntime
                  ? `inherits: ${inheritedArgs}`
                  : "e.g. --dangerously-skip-permissions"
              }
            />
          </label>

          <fieldset className="agent-config-field agent-config-prompts">
            <legend>
              Prompts{" "}
              <span className="muted">
                (per-role override — leave blank to use runtime or built-in default)
              </span>
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
                    {resolved.source.startsWith("runtime:") &&
                      `Inherits from ${resolved.source} → ${resolved.value}`}
                    {resolved.source === "built-in" &&
                      `Built-in default → ${resolved.value}`}
                    {resolved.source === "none" &&
                      "No built-in default — you MUST fill this in for dispatch to succeed"}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <label className="agent-config-field">
            <span>
              Specialties{" "}
              <span className="muted">
                (tag prefixes for dispatch routing, comma-separated; empty = accepts any tag)
              </span>
            </span>
            <input
              type="text"
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              placeholder="e.g. area/web, feature/ui"
            />
          </label>

          <label className="agent-config-field agent-config-field-inline">
            <span>Concurrency</span>
            <input
              type="number"
              min={1}
              value={form.concurrency}
              onChange={(e) =>
                setForm({ ...form, concurrency: Number(e.target.value) || 0 })
              }
            />
            {fieldErrors.concurrency && (
              <span className="agent-config-error">{fieldErrors.concurrency}</span>
            )}
          </label>

          <label className="agent-config-field agent-config-field-inline">
            <input
              type="checkbox"
              checked={form.dedicated}
              onChange={(e) => setForm({ ...form, dedicated: e.target.checked })}
            />
            <span>Dedicated (unchecked = pool mode)</span>
          </label>

          <label className="agent-config-field">
            <span>Description (optional)</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {error && <div className="agent-config-server-error">⚠ {error}</div>}

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
  runtime: string;
  prompts: Record<string, string>;
  specialties: string;
  concurrency: number;
  dedicated: boolean;
  description: string;
};

function deriveInitialForm(seed: AgentPublic | "new"): FormState {
  if (seed === "new") {
    return {
      name: "",
      roles: ["code"],
      mode: "single-prompt",
      command: "",
      args: "",
      runtime: "",
      prompts: {},
      specialties: "",
      concurrency: 1,
      dedicated: true,
      description: "",
    };
  }
  return {
    name: seed.name,
    roles: seed.roles.length > 0 ? [...seed.roles] : ["code"],
    mode: seed.mode ?? (seed.roles.includes("manager") ? "live-shell" : "single-prompt"),
    command: seed.command ?? "",
    args: (seed.args ?? []).join(" "),
    runtime: seed.runtime ?? "",
    prompts: { ...(seed.prompts ?? {}) },
    specialties: seed.specialties.join(", "),
    concurrency: seed.concurrency,
    dedicated: seed.dedicated,
    description: seed.description ?? "",
  };
}
