
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Plus, Trash2, RefreshCw, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react";
import Card from "@/components/common/Card";
import { SkeletonRows, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  reminderAt?: string | null;
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

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(() => localDateTime(new Date()));
  const [endAt, setEndAt] = useState(() =>
    localDateTime(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [reminderAt, setReminderAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await api<CalendarEvent[]>("/events");
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    const reminderDate = reminderAt ? new Date(reminderAt) : null;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter valid event start and end times.");
      return;
    }
    if (endDate <= startDate) {
      setError("The end time must be after the start time.");
      return;
    }
    if (reminderDate && (Number.isNaN(reminderDate.getTime()) || reminderDate >= startDate)) {
      setError("Choose a valid reminder time before the event starts.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      };
      const eventPayload = editingId
        ? { ...payload, reminderAt: reminderDate?.toISOString() ?? null }
        : { ...payload, ...(reminderDate ? { reminderAt: reminderDate.toISOString() } : {}) };

      await api<CalendarEvent>(editingId ? `/events/${encodeURIComponent(editingId)}` : "/events", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(eventPayload),
      });

      setTitle("");
      setDescription("");
      setReminderAt("");
      setEditingId(null);
      setNotice(editingId ? "Event updated successfully." : "Event created successfully.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save event.");
    } finally {
      setSaving(false);
    }
  }

  function editEvent(event: CalendarEvent) {
    setEditingId(event.id);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setStartAt(localDateTime(new Date(event.startAt)));
    setEndAt(localDateTime(new Date(event.endAt)));
    setReminderAt(event.reminderAt ? localDateTime(new Date(event.reminderAt)) : "");
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function moveAnchor(direction: -1 | 1) {
    setAnchorDate(current => {
      const next = new Date(current);
      if (view === "day") next.setDate(next.getDate() + direction);
      if (view === "week") next.setDate(next.getDate() + direction * 7);
      if (view === "month") next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  const rangeStart = new Date(anchorDate);
  if (view === "week") {
    const mondayOffset = (rangeStart.getDay() + 6) % 7;
    rangeStart.setDate(rangeStart.getDate() - mondayOffset);
  } else if (view === "month") {
    rangeStart.setDate(1);
  }
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  if (view === "day") rangeEnd.setDate(rangeEnd.getDate() + 1);
  if (view === "week") rangeEnd.setDate(rangeEnd.getDate() + 7);
  if (view === "month") rangeEnd.setMonth(rangeEnd.getMonth() + 1);
  const visibleEvents = events.filter(event => {
    const start = new Date(event.startAt);
    return start >= rangeStart && start < rangeEnd;
  });
  const rangeLabel = view === "day"
    ? rangeStart.toLocaleDateString([], { dateStyle: "full" })
    : view === "week"
      ? `${rangeStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(rangeEnd.getTime() - 1).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : rangeStart.toLocaleDateString([], { month: "long", year: "numeric" });

  async function deleteEvent(id: string) {
    if (!window.confirm("Delete this event?")) return;

    setError("");
    setNotice("");
    setDeletingId(id);

    try {
      await api(`/events/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (editingId === id) setEditingId(null);
      setEvents((current) => current.filter((event) => event.id !== id));
      setNotice("Event deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete event.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <Card title="Calendar">
        <div className="calendar-heading" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <CalendarDays size={28} />
          <div>
            <h2 style={{ margin: 0 }}>Your schedule</h2>
            <p style={{ margin: "4px 0 0", opacity: 0.7 }}>
              Create and manage your upcoming events.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            aria-label="Refresh events"
            style={{ marginLeft: "auto" }}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
        {notice && <p role="status" style={{ color: "green" }}>{notice}</p>}

        <form className="calendar-event-form" onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginBottom: 28 }}>
          <h3 style={{ margin: 0 }}>
          {editingId ? <Pencil size={17} style={{ verticalAlign: "middle" }} /> : <Plus size={17} style={{ verticalAlign: "middle" }} />} {editingId ? "Edit event" : "Add event"}
          </h3>

          <label>
            Event title *
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Project meeting"
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              rows={3}
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Start *
              <input
                type="datetime-local"
                required
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
              />
            </label>

            <label>
              End *
              <input
                type="datetime-local"
                required
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
              />
            </label>
          </div>

          <label>
            Optional reminder time
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5 }}
            />
          </label>

          <div className="calendar-form-actions">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save event" : "Create event"}
            </button>
            {editingId && <button className="secondary" type="button" onClick={() => { setEditingId(null); setTitle(""); setDescription(""); setReminderAt(""); }}>Cancel</button>}
          </div>
        </form>

        <hr />

        <div className="calendar-range">
          <div className="calendar-view-switch" role="group" aria-label="Calendar view">
            {(["day", "week", "month"] as const).map(mode => (
              <button type="button" key={mode} className={view === mode ? "active" : ""} aria-pressed={view === mode} onClick={() => setView(mode)}>
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="calendar-range-controls">
            <button type="button" onClick={() => moveAnchor(-1)} aria-label="Previous date range"><ChevronLeft /></button>
            <strong>{rangeLabel}</strong>
            <button type="button" onClick={() => moveAnchor(1)} aria-label="Next date range"><ChevronRight /></button>
            <button type="button" className="secondary" onClick={() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              setAnchorDate(today);
            }}>Today</button>
          </div>
        </div>

        {loading ? (
          <SkeletonStatus label="Loading calendar events">
            <SkeletonRows count={4} />
          </SkeletonStatus>
        ) : visibleEvents.length === 0 ? (
          <p className="empty">{events.length === 0 ? "No events yet. Add your first event above." : "No events in this date range."}</p>
        ) : (
          <div className="calendar-event-list">
            {visibleEvents.map((event) => (
                <article className="calendar-event" key={event.id}>
                  <div style={{ minWidth: 0 }}>
                    <h4>{event.title}</h4>
                    <p><strong>Start:</strong> {formatDate(event.startAt)}</p>
                    <p><strong>End:</strong> {formatDate(event.endAt)}</p>
                    {event.description && <p>{event.description}</p>}
                    {event.reminderAt && <p><strong>Reminder:</strong> {formatDate(event.reminderAt)}</p>}
                  </div>
                  <div className="calendar-event-actions">
                    <button type="button" className="secondary" onClick={() => editEvent(event)}><Pencil size={15} /> Edit</button>
                    <button
                      type="button"
                      className="calendar-delete"
                      onClick={() => void deleteEvent(event.id)}
                      disabled={deletingId === event.id}
                      aria-label={`Delete ${event.title}`}
                      title="Delete event"
                    >
                      {deletingId === event.id ? <span>Deleting…</span> : <Trash2 size={17} />}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}
      </Card>
    </section>
  );
}
