import type { AgentPublic, Change } from "../types";

export type AgentPickerModalProps = {
  change: Change;
  agents: AgentPublic[];
  onPick: (agentName: string) => void;
  onCancel: () => void;
};

/** Prompt when multiple agents in agents.yaml — pick which one to spawn. */
export function AgentPickerModal({ change, agents, onPick, onCancel }: AgentPickerModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Run agent for {change.id}</h3>
        <ul className="agent-picker">
          {agents.map((a) => (
            <li key={a.name}>
              <button onClick={() => onPick(a.name)}>
                <span className="agent-picker-name">{a.name}</span>
                {a.description && <span className="muted">{a.description}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
