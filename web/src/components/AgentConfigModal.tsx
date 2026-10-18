// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type {
  AgentConfigPayload,
  AgentMode,
  AgentPublic,
  AgentSessionStartup,
} from "../types";
import { getSessionToken } from "../runtime";
import { commandForAgentRole } from "../lib/managerCommand";
import {
  CLI_FIELD_CATEGORY_CONFIG,
  cliSessionStartupOptions,
  cliTextFieldPlaceholder,
  detectCliArgConflicts,
  detectCliSessionStartup,
  getCliFieldCategory,
  joinArgv,
  mergeCliArgs,
  migrateCliArgsForAdapterSwitch,
  orderedCliFieldCategories,
  parseCliArgs,
  resolveCliAdapter,
  resetFreeFormCliArgs,
  setCliSessionStartup,
  splitArgv,
  type CliFieldCategory,
  type CliFieldCategoryConfig,
} from "../lib/commandBuilder";

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

export function resolvedModelOptions(
  capability: {
    availableModels?: readonly string[];
  } | null,
  _selectedAdapter: { fields?: readonly { key: string }[] } | null,
): string[] {
  if (capability && Array.isArray(capability.availableModels) && capability.availableModels.length > 0) {
    return [...capability.availableModels];
  }
  return [];
}

export function resolvedVisibleFields(
  capability: {
    fields?: readonly { key: string; label: string; flag: string; kind: "text" | "select" | "boolean"; choices?: readonly string[]; dangerous?: boolean; guidance?: string }[];
  } | null,
  selectedAdapter: { fields?: readonly { key: string; label: string; flag: string; kind: "text" | "select" | "boolean"; choices?: readonly string[]; dangerous?: boolean; guidance?: string }[] } | null,
  state: "idle" | "loading" | "ready" | "error" | "missing",
) {
  if (capability && capability.fields && capability.fields.length > 0) {
    return capability.fields;
  }
  if (state === "idle" || state === "loading") {
    return selectedAdapter?.fields ?? [];
  }
  return [];
}

export function buildAgentConfigSavePayload({
  form,
  includesManager,
  agmsg,
  isAdd,
  existingNames,
}: {
  form: {
    name: string;
    roles: readonly string[];
    prompts: Record<string, string>;
    command: string;
    args: string;
    description: string;
    detached: boolean;
    sessionStartup?: AgentSessionStartup;
  };
  includesManager: boolean;
  agmsg: unknown;
  isAdd: boolean;
  existingNames: readonly string[];
}): AgentConfigPayload {
  const prompts: Record<string, string> = {};
  for (const [role, value] of Object.entries(form.prompts)) {
    const trimmed = value.trim();
    if (trimmed && form.roles.includes(role)) prompts[role] = trimmed;
  }

  const managerLocked = includesManager;
  const effectiveRoles = managerLocked ? ["manager"] : [...form.roles];
  const effectiveMode: AgentMode = (managerLocked || agmsg !== null) ? "live-shell" : "single-prompt";
  const effectiveName = !isAdd
    ? form.name.trim()
    : managerLocked
      ? "manager"
      : autoNameForWorker({ ...form, roles: [...form.roles], mode: "single-prompt" }, [...existingNames]);

  const payload: AgentConfigPayload = {
    action: "upsert",
    name: effectiveName,
    roles: effectiveRoles,
    mode: effectiveMode,
    prompts: Object.keys(prompts).length > 0 ? prompts : undefined,
    description: form.description.trim() || undefined,
    detached: includesManager ? undefined : form.detached,
    sessionStartup: includesManager ? form.sessionStartup : undefined,
  };
  if (form.command.trim()) {
    payload.command = form.command.trim();
    payload.args = splitArgv(form.args);
  }
  return payload;
}

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
  const lastRecognizedAdapterRef = useRef(resolveCliAdapter(initial.command));
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
    lastRecognizedAdapterRef.current = resolveCliAdapter(initial.command);
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
  const selectedAdapter = useMemo(() => resolveCliAdapter(form.command), [form.command]);
  const parsedArgs = useMemo(
    () => parseCliArgs(splitArgv(form.args), selectedAdapter),
    [form.args, selectedAdapter],
  );
  const argConflicts = useMemo(
    () => detectCliArgConflicts(splitArgv(form.args), selectedAdapter),
    [form.args, selectedAdapter],
  );
  const [capability, setCapability] = useState<{
    ok: boolean;
    supported: boolean;
    fields: Array<{ key: string; label: string; flag: string; kind: "text" | "select" | "boolean"; choices?: readonly string[]; dangerous?: boolean; guidance?: string }>;
    modelGuidance?: string;
    availableModels: string[];
    modelMetadata?: Array<{ id?: string; model?: string; displayName?: string; supportedReasoningEfforts?: readonly string[]; defaultReasoningEffort?: string }>;
    currentVersion?: string;
    danger?: readonly string[];
    reason?: string;
  } | null>(null);
  const [capabilityState, setCapabilityState] = useState<"idle" | "loading" | "ready" | "error" | "missing">("idle");

  useEffect(() => {
    const command = form.command.trim();
    if (!command) {
      setCapability(null);
      setCapabilityState("idle");
      return;
    }
    if (!selectedAdapter) {
      setCapability(null);
      setCapabilityState("missing");
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    const timer = window.setTimeout(async () => {
      setCapabilityState("loading");
      controller = new AbortController();
      try {
        const token = getSessionToken();
        const res = await fetch(`/api/cli/capabilities?command=${encodeURIComponent(command)}`, {
          headers: token ? { "X-Session-Token": token } : undefined,
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled) return;
        setCapability(json);
        if (!res.ok) {
          setCapabilityState("error");
          return;
        }
        setCapabilityState(json.supported ? "ready" : "error");
      } catch (err) {
        if (cancelled) return;
        setCapabilityState(err instanceof DOMException && err.name === "AbortError" ? "idle" : "error");
      }
    }, 250);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(timer);
    };
  }, [form.command, selectedAdapter]);

  const modelOptions = resolvedModelOptions(capability, selectedAdapter);
  const sessionStartupOptions = selectedAdapter && includesManager
    ? cliSessionStartupOptions(selectedAdapter.id)
    : [];
  const sessionStartupMode = selectedAdapter && sessionStartupOptions.length > 0
    ? form.sessionStartup ?? detectCliSessionStartup(selectedAdapter.id, splitArgv(form.args))
    : "new";
  const visibleFields = resolvedVisibleFields(capability, selectedAdapter, capabilityState);
  const managedOnlyArgs = useMemo(
    () => selectedAdapter
      ? resetFreeFormCliArgs(splitArgv(form.args), selectedAdapter)
      : splitArgv(form.args),
    [form.args, selectedAdapter],
  );
  const hasFreeFormArgs = joinArgv(managedOnlyArgs) !== joinArgv(splitArgv(form.args));
  const categorySections = useMemo<Array<{
    category: CliFieldCategory;
    fields: Array<{ key: string; label: string; flag: string; kind: "text" | "select" | "boolean"; choices?: readonly string[]; dangerous?: boolean; guidance?: string }>;
    config: CliFieldCategoryConfig;
  }>>(() => {
    const ordered = orderedCliFieldCategories(visibleFields);
    const sections: Array<{
      category: CliFieldCategory;
      fields: Array<{ key: string; label: string; flag: string; kind: "text" | "select" | "boolean"; choices?: readonly string[]; dangerous?: boolean; guidance?: string }>;
      config: CliFieldCategoryConfig;
    }> = [];

    for (const category of ordered) {
      if (category === "advanced") continue;
      const fields = visibleFields.filter((field) => getCliFieldCategory(field) === category);
      if (fields.length === 0) continue;
      sections.push({
        category,
        fields,
        config: CLI_FIELD_CATEGORY_CONFIG[category],
      });
    }

    sections.push({
      category: "advanced",
      fields: [],
      config: CLI_FIELD_CATEGORY_CONFIG.advanced,
    });
    return sections;
  }, [visibleFields]);

  const defaultExpandedCategories = useMemo<Record<CliFieldCategory, boolean>>(() => {
    const defaultState = Object.fromEntries(
      orderedCliFieldCategories(visibleFields).map((category) => [category, category === "model" || category === "reasoning"]),
    ) as Record<CliFieldCategory, boolean>;
    return {
      model: defaultState.model ?? false,
      reasoning: defaultState.reasoning ?? false,
      permissions: defaultState.permissions ?? false,
      sandbox: defaultState.sandbox ?? false,
      execution: defaultState.execution ?? false,
      context: defaultState.context ?? false,
      "tools-access": defaultState["tools-access"] ?? false,
      "unattended-dangerous": defaultState["unattended-dangerous"] ?? false,
      advanced: defaultState.advanced ?? false,
    };
  }, [visibleFields]);

  const [expandedCategories, setExpandedCategories] = useState<Record<CliFieldCategory, boolean>>(() => defaultExpandedCategories);

  useEffect(() => {
    setExpandedCategories((prev) => {
      const next = { ...prev };
      for (const category of orderedCliFieldCategories(visibleFields)) {
        if (!(category in next)) {
          next[category] = category === "model" || category === "reasoning";
        }
      }
      return next;
    });
  }, [visibleFields]);

  const updateBuilderField = (field: string, value: string | boolean | undefined) => {
    const nextArgs = mergeCliArgs(splitArgv(form.args), { [field]: value });
    setForm((f) => ({ ...f, args: joinArgv(nextArgs) }));
  };

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
    const builtIn = commandForAgentRole(form.command.trim(), role);
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

    const payload = buildAgentConfigSavePayload({
      form,
      includesManager,
      agmsg,
      isAdd,
      existingNames,
    });
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
              onChange={(e) => {
                const nextCommand = e.target.value;
                setForm((current) => {
                  const previousAdapter = resolveCliAdapter(current.command)
                    ?? lastRecognizedAdapterRef.current;
                  const nextAdapter = resolveCliAdapter(nextCommand);
                  const nextArgs = migrateCliArgsForAdapterSwitch(
                    splitArgv(current.args),
                    previousAdapter,
                    nextAdapter,
                  );
                  if (nextAdapter) lastRecognizedAdapterRef.current = nextAdapter;
                  const adapterChanged = previousAdapter?.id !== nextAdapter?.id;
                  return {
                    ...current,
                    command: nextCommand,
                    args: joinArgv(nextArgs),
                    sessionStartup: includesManager && adapterChanged
                      ? (nextAdapter?.id === "claude" ? "managed" : nextAdapter ? "new" : undefined)
                      : current.sessionStartup,
                  };
                });
              }}
              placeholder="e.g. claude"
            />
            {fieldErrors.command && (
              <span className="form-field-error">{fieldErrors.command}</span>
            )}
          </label>
          {selectedAdapter ? (
            <fieldset className="agent-config-field">
              <legend>
                CLI builder — {selectedAdapter.displayName}
              </legend>
              <div className="agent-config-field agent-config-free-form-args">
                <div className="agent-config-free-form-header">
                  <span>Free-form args (optional)</span>
                  <button
                    type="button"
                    className="ghost agent-config-free-form-reset"
                    disabled={!hasFreeFormArgs}
                    onClick={() => setForm((current) => ({
                      ...current,
                      args: joinArgv(resetFreeFormCliArgs(splitArgv(current.args), selectedAdapter)),
                    }))}
                    title="Remove only arguments not managed by this CLI builder"
                    aria-label="Reset free-form arguments"
                  >
                    🔄
                  </button>
                </div>
                <textarea
                  value={form.args}
                  onChange={(event) => {
                    const args = event.target.value;
                    const detected = selectedAdapter
                      ? detectCliSessionStartup(selectedAdapter.id, splitArgv(args))
                      : "new";
                    setForm((current) => ({
                      ...current,
                      args,
                      sessionStartup: includesManager
                        ? (detected === "new" && current.sessionStartup === "managed" ? "managed" : detected)
                        : current.sessionStartup,
                    }));
                  }}
                  rows={2}
                  placeholder={'--flag "value" --custom-flag'}
                />
                <span className="muted">
                  Enter or paste the complete argument list. The fields below update from this value.
                </span>
              </div>
              {selectedAdapter && sessionStartupOptions.length > 0 && (
                <label className="agent-config-field">
                  <span>Session startup</span>
                  <select
                    value={sessionStartupMode}
                    onChange={(event) => {
                      if (event.target.value === "custom") return;
                      const sessionStartup = event.target.value as Exclude<AgentSessionStartup, "custom">;
                      const args = setCliSessionStartup(
                        selectedAdapter.id,
                        splitArgv(form.args),
                        sessionStartup,
                      );
                      setForm({ ...form, args: joinArgv(args), sessionStartup });
                    }}
                  >
                    {sessionStartupMode === "custom" && (
                      <option value="custom">Custom session target (edit free-form args)</option>
                    )}
                    {sessionStartupOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {selectedAdapter.id === "claude" && sessionStartupMode === "managed" && (
                    <span className="muted">
                      ithyno creates a project session ID on first launch and resumes that same ID later. Other CLI options remain active.
                    </span>
                  )}
                </label>
              )}
              <div className="agent-config-builder-groups">
                {categorySections.map((section) => {
                  const isAdvanced = section.category === "advanced";
                  const categoryLabel = section.config.label;
                  const header = (
                    <summary>
                      <span className="agent-config-category-title">
                        <span className="agent-config-category-chevron" aria-hidden="true">›</span>
                        {categoryLabel}
                      </span>
                      {section.config.dangerous && <span className="agent-config-danger-pill">Warning</span>}
                    </summary>
                  );

                  const isExpanded = expandedCategories[section.category] ?? section.config.defaultOpen;

                  return (
                    <details
                      key={`${selectedAdapter.id}-${section.category}`}
                      className={section.config.dangerous ? "agent-config-category agent-config-category-danger" : "agent-config-category"}
                      open={isExpanded}
                      onToggle={(event) => {
                        // React clears currentTarget after the event handler returns.
                        // Capture the DOM value before entering the deferred state
                        // updater instead of reading from the event inside it.
                        const isOpen = event.currentTarget.open;
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [section.category]: isOpen,
                        }));
                      }}
                    >
                      {header}
                      {isAdvanced ? (
                        <div className="agent-config-advanced-body">
                          <span className="muted">Persisted command and argv (read-only)</span>
                          <pre className="agent-config-argv-preview"><code>
                            {form.command
                              ? `${form.command}${form.args.trim() ? ` ${joinArgv(splitArgv(form.args))}` : ""}`
                              : "(set command first)"}
                          </code></pre>
                        </div>
                      ) : (
                        <div className="agent-config-builder-grid">
                          {section.fields.map((field) => {
                            const canonicalKey = field.flag.replace(/^--?/, "").replace(/-+/g, "-");
                            const currentValue = parsedArgs.values[canonicalKey]?.[0] ?? "";
                            if (field.kind === "boolean") {
                              return (
                                <label key={field.key} className="agent-config-field agent-config-checkbox-field">
                                  <span>
                                    <input
                                      type="checkbox"
                                      checked={currentValue === "true"}
                                      onChange={(e) => updateBuilderField(canonicalKey, e.target.checked)}
                                    />{" "}
                                    {field.label}
                                    {field.dangerous && " — dangerous"}
                                  </span>
                                </label>
                              );
                            }
                            if (field.kind === "select") {
                              return (
                                <label key={field.key} className="agent-config-field">
                                  <span>{field.label}</span>
                                  <select
                                    value={currentValue}
                                    onChange={(e) => updateBuilderField(canonicalKey, e.target.value || undefined)}
                                  >
                                    <option value="">(unset)</option>
                                    {(field.choices ?? []).map((choice) => (
                                      <option key={choice} value={choice}>{choice}</option>
                                    ))}
                                  </select>
                                </label>
                              );
                            }
                            const modelListId = `${selectedAdapter?.id ?? "cli"}-models`;
                            const hasDiscoveredModelOptions = modelOptions.length > 0;
                            const shouldUseDatalist = field.key === "model" && hasDiscoveredModelOptions;
                            return (
                              <label key={field.key} className="agent-config-field">
                                <span>{field.label}</span>
                                {shouldUseDatalist ? (
                                  <>
                                    <input
                                      type="text"
                                      list={modelListId}
                                      value={currentValue}
                                      onChange={(e) => updateBuilderField(canonicalKey, e.target.value || undefined)}
                                      placeholder={cliTextFieldPlaceholder(selectedAdapter.id, field, modelOptions)}
                                    />
                                    <datalist id={modelListId}>
                                      {modelOptions.map((option) => (
                                        <option key={option} value={option} />
                                      ))}
                                    </datalist>
                                  </>
                                ) : (
                                  <input
                                    type="text"
                                    value={currentValue}
                                    onChange={(e) => updateBuilderField(canonicalKey, e.target.value || undefined)}
                                    placeholder={cliTextFieldPlaceholder(selectedAdapter.id, field, modelOptions)}
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
              {capabilityState === "loading" && <p className="muted">Loading bundled CLI catalog…</p>}
              {capabilityState === "error" && <p className="form-field-error">Failed to load the bundled CLI catalog.</p>}
              {(capability?.modelGuidance ?? selectedAdapter?.modelGuidance) && (
                <p className="muted">{capability?.modelGuidance ?? selectedAdapter?.modelGuidance}</p>
              )}
              {argConflicts.length > 0 && (
                <div className="form-field-error" role="alert">
                  Conflicting recognized args detected: {argConflicts.join(", ")}
                </div>
              )}
            </fieldset>
          ) : (
            <label className="agent-config-field">
              <span>Args (argv, preserves quoted values)</span>
              <input
                type="text"
                value={form.args}
                onChange={(e) => setForm({ ...form, args: e.target.value })}
                placeholder={'e.g. --dangerously-skip-permissions --profile "fast"'}
              />
            </label>
          )}

          <fieldset className="agent-config-field agent-config-prompts">
            <legend>
              {includesManager ? (
                <>
                  Prompt{" "}
                  <span className="muted">
                    (typed into the PTY after Manager boots — leave blank for the CLI-specific built-in)
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
                {!includesManager && (
                  <label className="agent-config-field agent-config-checkbox-field">
                    <span>
                      <input
                        type="checkbox"
                        checked={form.detached}
                        onChange={(e) => setForm({ ...form, detached: e.target.checked })}
                      />{" "}
                      Keep this Worker running across server restarts (detached)
                    </span>
                  </label>
                )}
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
            <button
              type="button"
              className="ghost agent-config-reset-args"
              disabled={submitting || !form.args.trim()}
              onClick={() => setForm((current) => ({
                ...current,
                args: "",
                sessionStartup: includesManager && selectedAdapter
                  ? (selectedAdapter.id === "claude" ? "managed" : "new")
                  : current.sessionStartup,
              }))}
              title="Clear Session startup, structured CLI options, and free-form arguments in this draft"
            >
              Reset all arguments
            </button>
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
  detached: boolean;
  sessionStartup?: AgentSessionStartup;
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
      detached: false,
      sessionStartup: undefined,
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
    detached: seed.detached === true,
    sessionStartup: seed.sessionStartup
      ?? (rolesFromSeed.includes("manager") && resolveCliAdapter(seed.command)?.id === "claude" && (seed.args ?? []).length === 0
        ? "managed"
        : rolesFromSeed.includes("manager") && resolveCliAdapter(seed.command)
          ? detectCliSessionStartup(resolveCliAdapter(seed.command)!.id, seed.args ?? [])
          : undefined),
  };
}
