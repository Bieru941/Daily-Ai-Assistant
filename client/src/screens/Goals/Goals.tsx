import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import Card from "@/components/common/Card";
import { Skeleton, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type Goal = { id: string; title: string; progress: number };

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
  const [busyGoalId, setBusyGoalId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const loadedGoals = await api<Goal[]>("/goals");
      setGoals(loadedGoals);
      setProgressDrafts(Object.fromEntries(
        loadedGoals.map(goal => [goal.id, String(goal.progress)])
      ));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load goals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!title.trim()) return;
    try {
      await api("/goals", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), progress: 0 }),
      });
      setTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create goal");
    }
  }

  async function updateProgress(goal: Goal) {
    const progress = Number(progressDrafts[goal.id]);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      setError("Progress must be a whole number from 0 to 100.");
      return;
    }

    setBusyGoalId(goal.id);
    try {
      await api(`/goals/${goal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ progress }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update goal progress");
    } finally {
      setBusyGoalId(null);
    }
  }

  async function remove(goal: Goal) {
    if (!window.confirm(`Delete "${goal.title}"?`)) return;

    setBusyGoalId(goal.id);
    try {
      await api(`/goals/${goal.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete goal");
    } finally {
      setBusyGoalId(null);
    }
  }

  return (
    <section>
      <div className="toolbar">
        <input placeholder="Create a goal..." value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void add(); }} />
        <button className="primary" onClick={() => void add()}><Plus /> Add goal</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid three">
        {loading ? (
          <SkeletonStatus label="Loading goals" className="grid three">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} title="Loading goal">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                  <Skeleton variant="line" />
                </div>
              </Card>
            ))}
          </SkeletonStatus>
        ) : goals.map(g => (
          <Card key={g.id} title={g.title}>
            <div
              className="progress"
              role="progressbar"
              aria-label={`${g.title} progress`}
              aria-valuenow={g.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${g.progress}%` }} />
            </div>
            <div className="toolbar">
              <label>
                Progress (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={progressDrafts[g.id] ?? String(g.progress)}
                  disabled={busyGoalId === g.id}
                  onChange={event => setProgressDrafts(drafts => ({
                    ...drafts,
                    [g.id]: event.target.value,
                  }))}
                />
              </label>
              <button
                className="secondary"
                disabled={busyGoalId === g.id}
                onClick={() => void updateProgress(g)}
              >
                <Save /> Save
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete ${g.title}`}
                disabled={busyGoalId === g.id}
                onClick={() => void remove(g)}
              >
                <Trash2 />
              </button>
            </div>
          </Card>
        ))}
        {!loading && !goals.length && <p className="empty">Create your first goal.</p>}
      </div>
    </section>
  );
}