import { useStore, taskKey } from "../store";
import type { TaskList } from "../types";

export function TaskTree({
  tasks,
  hideCompleted = false,
}: {
  tasks: TaskList;
  hideCompleted?: boolean;
}) {
  const toggle = useStore((s) => s.toggle);
  const conflicts = useStore((s) => s.conflicts);
  const dismissConflict = useStore((s) => s.dismissConflict);

  if (tasks.parseError) {
    return (
      <div className="parse-error">
        <p>⚠ Could not parse tasks.md ({tasks.parseError}). Showing raw text:</p>
        <pre className="md-raw">{tasks.raw}</pre>
      </div>
    );
  }

  if (tasks.sections.every((s) => s.tasks.length === 0)) {
    return <p className="empty">No tasks found in tasks.md.</p>;
  }

  const sections = hideCompleted
    ? tasks.sections.map((s) => ({ ...s, tasks: s.tasks.filter((t) => !t.checked) }))
    : tasks.sections;

  if (hideCompleted && sections.every((s) => s.tasks.length === 0)) {
    return <p className="empty">All tasks complete.</p>;
  }

  return (
    <div className="task-tree">
      {sections.map((section) =>
        section.tasks.length === 0 ? null : (
          <section key={section.title} className="task-section">
            <h4>{section.title}</h4>
            <ul>
              {section.tasks.map((task) => {
                const key = taskKey(task);
                const conflict = conflicts[key];
                return (
                  <li key={key} className={`task-item${task.checked ? " checked" : ""}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={task.checked}
                        onChange={() => toggle(task)}
                      />
                      <span className="task-id">{task.id}</span>
                      <span className="task-text">{task.text}</span>
                    </label>
                    {conflict && (
                      <div className="task-conflict" role="alert">
                        <span>⚠ {conflict.message}</span>
                        <button onClick={() => toggle(task)}>もう一度チェック</button>
                        <button className="ghost" onClick={() => dismissConflict(key)}>
                          閉じる
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
