import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Card from "@/components/common/Card";
import { SkeletonRows, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";
import { playSound } from "@/services/sound";
import type { Task } from "@/types/task";

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("MEDIUM");
  const [category, setCategory] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("MEDIUM");
  const [editCategory, setEditCategory] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("position");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  async function load() {
    try {
      setTasks(await api<Task[]>("/tasks"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!title.trim()) return;
    try {
      const dueDate = dueAt ? new Date(`${dueAt}T23:59:59`) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        setError("Enter a valid task due date.");
        return;
      }
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          priority,
          category: category.trim() || undefined,
          ...(dueDate ? { dueAt: dueDate.toISOString() } : {}),
        }),
      });
      setTitle("");
      setDueAt("");
      setPriority("MEDIUM");
      setCategory("");
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add task");
    }
  }

  async function toggle(task: Task) {
    await updateStatus(task, task.status === "COMPLETED" ? "TODO" : "COMPLETED");
  }

  async function updateStatus(task: Task, status: Task["status"]) {
    setBusyTaskId(task.id);
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (status === "COMPLETED" && task.status !== "COMPLETED") {
        playSound("task-complete");
      }
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update task");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function remove(id: string) {
    const task = tasks.find(item => item.id === id);
    if (!task || !window.confirm(`Delete "${task.title}"?`)) return;

    setBusyTaskId(id);
    try {
      await api(`/tasks/${id}`, { method: "DELETE" });
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete task");
    } finally {
      setBusyTaskId(null);
    }
  }

  function beginEdit(task: Task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDueAt(task.dueAt ? localDateInput(new Date(task.dueAt)) : "");
    setEditPriority(task.priority);
    setEditCategory(task.category ?? "");
  }

  async function saveEdit() {
    if (!editingTask || !editTitle.trim()) return;
    const dueDate = editDueAt ? new Date(`${editDueAt}T23:59:59`) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      setError("Enter a valid task due date.");
      return;
    }

    setBusyTaskId(editingTask.id);
    try {
      await api(`/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          dueAt: dueDate?.toISOString() ?? null,
          priority: editPriority,
          category: editCategory.trim(),
        }),
      });
      setEditingTask(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save task changes");
    } finally {
      setBusyTaskId(null);
    }
  }

  const shown = tasks
    .filter(task => filter === "ALL" || task.status === filter)
    .filter(task => `${task.title} ${task.category ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "priority") {
        const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityRank[left.priority] - priorityRank[right.priority];
      }
      if (sort === "due") {
        if (!left.dueAt) return right.dueAt ? 1 : 0;
        if (!right.dueAt) return -1;
        return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      }
      return 0;
    });
  const inProgress = tasks.filter(task => task.status === "IN_PROGRESS").length;
  const completed = tasks.filter(task => task.status === "COMPLETED").length;

  return (
    <section className="tasks-page">
      <div className="task-create">
        <div className="task-create-copy">
          <span className="task-eyebrow">TASK LIST</span>
          <h3>What needs your attention?</h3>
          <p>Capture a task and keep your day moving.</p>
        </div>
        <form
          className="task-create-form"
          onSubmit={event => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            aria-label="New task title"
            value={title}
            maxLength={200}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Prepare for tomorrow's meeting"
          />
          <label className="task-create-option">
            <span>Due date</span>
            <input
              aria-label="Task due date"
              type="date"
              value={dueAt}
              onChange={event => setDueAt(event.target.value)}
            />
          </label>
          <label className="task-create-option">
            <span>Priority</span>
            <select value={priority} onChange={event => setPriority(event.target.value as Task["priority"])}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label className="task-create-option task-category-option">
            <span>Category</span>
            <input
              aria-label="Task category"
              value={category}
              maxLength={80}
              onChange={event => setCategory(event.target.value)}
              placeholder="General"
            />
          </label>
          <button className="primary" type="submit" disabled={!title.trim()}>
            <Plus /> Add task
          </button>
        </form>
      </div>
      <div className="task-overview">
        <div className="task-counts" aria-label="Task summary">
          <span><strong>{tasks.length}</strong> total</span>
          <span><strong>{inProgress}</strong> in progress</span>
          <span><strong>{completed}</strong> completed</span>
        </div>
        <label className="task-filter">
          <span>Show</span>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="ALL">All tasks</option>
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          </select>
        </label>
      </div>
      <div className="task-tools">
        <label className="task-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search tasks or categories"
            aria-label="Search tasks"
          />
        </label>
        <label className="task-sort">
          <span>Sort by</span>
          <select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="position">Custom order</option>
            <option value="title">Title</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
          </select>
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <Card title="Your tasks">
          <SkeletonStatus label="Loading tasks">
            <SkeletonRows count={5} />
          </SkeletonStatus>
        </Card>
      ) : <Card title={`Your tasks · ${shown.length}`}>
        <div className="task-list">
          {shown.map(t => (
            <div className={`task-row${editingTask?.id === t.id ? " is-editing" : ""}`} key={t.id}>
              {editingTask?.id === t.id ? (
              <form className="task-edit-form" onSubmit={event => { event.preventDefault(); void saveEdit(); }}>
                <input aria-label="Edit task title" value={editTitle} maxLength={200} onChange={event => setEditTitle(event.target.value)} required />
                <input aria-label="Edit due date" type="date" value={editDueAt} onChange={event => setEditDueAt(event.target.value)} />
                <select aria-label="Edit priority" value={editPriority} onChange={event => setEditPriority(event.target.value as Task["priority"])}>
                  <option value="LOW">Low priority</option>
                  <option value="MEDIUM">Medium priority</option>
                  <option value="HIGH">High priority</option>
                </select>
                <input aria-label="Edit category" value={editCategory} maxLength={80} onChange={event => setEditCategory(event.target.value)} placeholder="Category" />
                <div>
                  <button type="submit" className="secondary" disabled={busyTaskId === t.id || !editTitle.trim()}><Check size={16} /> Save</button>
                  <button type="button" className="icon-btn" onClick={() => setEditingTask(null)} aria-label="Cancel task edit"><X size={16} /></button>
                </div>
              </form>
              ) : (
              <>
                <button
                  className={`task-check ${t.status === "COMPLETED" ? "done" : ""}`}
                  disabled={busyTaskId === t.id}
                  onClick={() => void toggle(t)}
                  aria-label={t.status === "COMPLETED" ? `Mark ${t.title} incomplete` : `Complete ${t.title}`}
                >
                  {t.status === "COMPLETED" ? "✓" : ""}
                </button>
                <div className="task-info">
                  <b className={t.status === "COMPLETED" ? "strike" : ""}>{t.title}</b>
                  <small>{t.category || "General"}{t.dueAt ? ` · Due ${new Date(t.dueAt).toLocaleDateString()}` : ""}</small>
                </div>
                <select
                  className={`task-status ${t.status.toLowerCase().replace("_", "-")}`}
                  aria-label={`Status for ${t.title}`}
                  value={t.status}
                  disabled={busyTaskId === t.id}
                  onChange={event => {
                    const status = event.target.value;
                    if (status === "TODO" || status === "IN_PROGRESS" || status === "COMPLETED") {
                      void updateStatus(t, status);
                    }
                  }}
                >
                  <option value="TODO">To do</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <span className={`task-priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
                <button className="task-edit" disabled={busyTaskId === t.id} onClick={() => beginEdit(t)} aria-label={`Edit ${t.title}`}><Pencil /></button>
                <button className="task-delete" disabled={busyTaskId === t.id} onClick={() => void remove(t.id)} aria-label={`Delete ${t.title}`}><Trash2 /></button>
              </>
              )}
            </div>
          ))}
          {!shown.length && (
            <div className="task-empty">
              <span className="task-empty-icon"><Plus /></span>
              <strong>{tasks.length ? "No tasks in this view" : "Your task list is clear"}</strong>
              <p>{tasks.length ? "Change your search or filters to find other tasks." : "Add a task above when something comes to mind."}</p>
            </div>
          )}
        </div>
      </Card>}
    </section>
  );
}