import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { playSound } from "@/services/sound";
import type { Task } from "@/types/task";

export type { Task } from "@/types/task";

export default function TaskList({
  tasks,
  compact = false,
  onChange,
}: {
  tasks: Task[];
  compact?: boolean;
  onChange?: () => void;
}) {
  const [items, setItems] = useState(tasks);
  const [error, setError] = useState("");

  useEffect(() => setItems(tasks), [tasks]);

  async function toggle(task: Task) {
    const status = task.status === "COMPLETED" ? "TODO" : "COMPLETED";

    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setItems((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, status } : item
        )
      );
      if (status === "COMPLETED" && task.status !== "COMPLETED") {
        playSound("task-complete");
      }
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="list">
      {error && <p className="error">{error}</p>}

      {items.slice(0, compact ? 6 : undefined).map((task) => (
        <div className="row" key={task.id}>
          <button
            className={`check ${task.status === "COMPLETED" ? "done" : ""}`}
            onClick={() => void toggle(task)}
          >
            {task.status === "COMPLETED" ? "✓" : ""}
          </button>
          <div className="grow">
            <b className={task.status === "COMPLETED" ? "strike" : ""}>
              {task.title}
            </b>
            <small>{task.category || "General"} · {task.priority}</small>
          </div>
          <span className={`priority ${task.priority.toLowerCase()}`}>
            {task.priority}
          </span>
        </div>
      ))}

      {!items.length && <p className="empty">No tasks yet.</p>}
    </div>
  );
}