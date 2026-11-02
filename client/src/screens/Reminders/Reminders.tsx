
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, Plus, Trash2, RefreshCw } from "lucide-react";
import Card from "@/components/common/Card";
import { SkeletonRows, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type Recurrence = "ONCE" | "DAILY" | "WEEKLY" | "CUSTOM";

type Reminder = {
  id: string;
  title: string;
  remindAt: string;
  recurrence?: Recurrence;
};

function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState(() =>
    localDateTime(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [recurrence, setRecurrence] = useState<Recurrence>("ONCE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReminders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await api<Reminder[]>("/reminders");
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");

    setSaving(true);

    try {
      const payload = {
        title: title.trim(),
        remindAt: new Date(remindAt).toISOString(),
        recurrence,
      };

      await api<Reminder>("/reminders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setTitle("");
      setRemindAt(localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
      setRecurrence("ONCE");
      setNotice("Reminder created successfully.");
      await loadReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reminder.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReminder(id: string) {
    if (!window.confirm("Delete this reminder?")) return;

    setError("");
    setNotice("");
    setDeletingId(id);

    try {
      await api(`/reminders/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setReminders((current) => current.filter((reminder) => reminder.id !== id));
      setNotice("Reminder deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete reminder.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section>
      <Card title="Reminders">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Clock3 size={28} />
          <div>
            <h2 style={{ margin: 0 }}>Stay on time</h2>
            <p style={{ margin: "4px 0 0", opacity: 0.7 }}>
              Create reminders for tasks and important moments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadReminders()}
            disabled={loading}
            aria-label="Refresh reminders"
            style={{ marginLeft: "auto" }}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
        {notice && <p role="status" style={{ color: "green" }}>{notice}</p>}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginBottom: 28 }}>
          <h3 style={{ margin: 0 }}>
            <Plus size={17} style={{ verticalAlign: "middle" }} /> Add reminder
          </h3>

          <label>
            Reminder title *
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Submit school project"
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Date and time *
            <input
              type="datetime-local"
              required
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Repeat
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}
            >
              <option value="ONCE">Once</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>

          <div>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create reminder"}
            </button>
          </div>
        </form>

        <hr />

        <h3>Your reminders</h3>

        {loading ? (
          <SkeletonStatus label="Loading reminders">
            <SkeletonRows count={4} />
          </SkeletonStatus>
        ) : reminders.length === 0 ? (
          <p>No reminders yet. Add your first reminder above.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {reminders.map((reminder) => (
              <article
                key={reminder.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 14,
                  border: "1px solid var(--border-color, #ddd)",
                  borderRadius: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ margin: "0 0 8px" }}>{reminder.title}</h4>
                  <p style={{ margin: "4px 0" }}>
                    <strong>When:</strong> {formatDate(reminder.remindAt)}
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>Repeat:</strong> {reminder.recurrence ?? "ONCE"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void deleteReminder(reminder.id)}
                  disabled={deletingId === reminder.id}
                  aria-label={`Delete ${reminder.title}`}
                  title="Delete reminder"
                >
                  <Trash2 size={17} />
                  {deletingId === reminder.id ? "Deleting..." : ""}
                </button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
