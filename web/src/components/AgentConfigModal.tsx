// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import type { AgentConfigPayload, AgentPublic, RuntimeDefPublic } from "../types";

/**
 * Modal for editing (or adding) an entry in `agents.yaml`. Save posts
 * to `/api/agents/config` — the Phase 5.3 endpoint. Until 5.3 lands
 * the endpoint 404s and the parent surfaces the error as a toast.
 *
 * Shape toggle (legacy vs runtime-backed) is exposed because
 * `agents.yaml` supports both — see add-runtime-abstraction. The
 * modal hides the fields of the non-active shape to keep the form
 * focused.
 */

const ROLE_OPTIONS = ["code", "review", "verify", "manager", "other"] as const;
type Shape = "legacy" | "runtime";

const KEBAB_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

type Props = {
  /** `null` = edit mode with a starting agent (name field disabled);
   *  `"new"` = add mode (name field editable + empty defaults). */
  seed: AgentPublic | "new";
  runtimes: RuntimeDefPublic[];
  onCancel: () => void;
  onSubmit: (payload: AgentConfigPayload) => Promise<void>;
};

export function AgentConfigModal({ seed, runtimes, onCancel, onSubmit }: Props) {
  const isAdd = seed === "new";
  const initial = useMemo(() => deriveInitialForm(seed), [seed]);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (isAdd && !KEBAB_RE.test(form.name)) {
      errs.name = "kebab-case letters, digits and hyphens only (e.g. reviewer)";
    }
    if (!Number.isFinite(form.concurrency) || form.concurrency < 1) {
      errs.concurrency = "must be an integer ≥ 1";
    }
    if (form.shape === "legacy") {
      if (!form.command.trim()) errs.command = "required for legacy agents";
    } else {
      if (!form.runtime) errs.runtime = "pick a runtime";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: AgentConfigPayload = {
      action: "upsert",
      name: form.name.trim(),
      role: form.role,
      specialties: form.specialties
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      concurrency: form.concurrency,
      dedicated: form.dedicated,
      description: form.description.trim() || undefined,
      ...(form.shape === "legacy"
        ? {
            command: form.command.trim(),
            args: form.args
              .split(/\s+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          }
        : {
            runtime: form.runtime,
            prompt: form.prompt.trim() || undefined,
          }),
    };

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

          <label className="agent-config-field">
            <span>Role</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="agent-config-field agent-config-shape">
            <legend>Shape</legend>
            <label>
              <input
                type="radio"
                name="shape"
                checked={form.shape === "legacy"}
                onChange={() => setForm({ ...form, shape: "legacy" })}
              />
              Legacy (command + args)
            </label>
            <label>
              <input
                type="radio"
                name="shape"
                checked={form.shape === "runtime"}
                onChange={() => setForm({ ...form, shape: "runtime" })}
              />
              Runtime-backed (runtime + prompt)
            </label>
          </fieldset>

          {form.shape === "legacy" ? (
            <>
              <label className="agent-config-field">
                <span>Command</span>
                <input
                  type="text"
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="e.g. claude"
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
                  placeholder="e.g. --dangerously-skip-permissions -p /opsx:apply ${change_id}"
                />
              </label>
            </>
          ) : (
            <>
              <label className="agent-config-field">
                <span>Runtime</span>
                <select
                  value={form.runtime}
                  onChange={(e) => setForm({ ...form, runtime: e.target.value })}
                >
                  <option value="">— pick a runtime —</option>
                  {runtimeOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {fieldErrors.runtime && (
                  <span className="agent-config-error">{fieldErrors.runtime}</span>
                )}
              </label>
              <label className="agent-config-field">
                <span>Prompt</span>
                <textarea
                  value={form.prompt}
                  rows={3}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder="e.g. /opsx:apply ${change_id}"
                />
              </label>
            </>
          )}

          <label className="agent-config-field">
            <span>Specialties (comma-separated)</span>
            <input
              type="text"
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              placeholder="e.g. area/web, security"
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
  role: string;
  shape: Shape;
  command: string;
  args: string;
  runtime: string;
  prompt: string;
  specialties: string;
  concurrency: number;
  dedicated: boolean;
  description: string;
};

function deriveInitialForm(seed: AgentPublic | "new"): FormState {
  if (seed === "new") {
    return {
      name: "",
      role: "code",
      shape: "legacy",
      command: "",
      args: "",
      runtime: "",
      prompt: "",
      specialties: "",
      concurrency: 1,
      dedicated: true,
      description: "",
    };
  }
  const isRuntimeBacked = !!seed.runtime;
  return {
    name: seed.name,
    role: seed.role,
    shape: isRuntimeBacked ? "runtime" : "legacy",
    command: seed.command ?? "",
    args: (seed.args ?? []).join(" "),
    runtime: seed.runtime ?? "",
    prompt: seed.prompt ?? "",
    specialties: seed.specialties.join(", "),
    concurrency: seed.concurrency,
    dedicated: seed.dedicated,
    description: seed.description ?? "",
  };
}
