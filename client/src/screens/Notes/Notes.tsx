import { useEffect, useState } from "react";
import { FileText, Pin, Plus, Save, Search, Trash2, X } from "lucide-react";
import Card from "@/components/common/Card";
import { Skeleton, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type Note = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  pinned: boolean;
  updatedAt: string;
};

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setNotes(await api<Note[]>("/notes"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function resetEditor() {
    setTitle("");
    setContent("");
    setCategory("");
    setEditingId(null);
  }

  function edit(note: Note) {
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category ?? "");
    setEditingId(note.id);
    setError("");
  }

  async function save() {
    if (!title.trim() || !content.trim()) {
      setError("Add a title and some note content before saving.");
      return;
    }

    const body = JSON.stringify({
      title: title.trim(),
      content: content.trim(),
      category: category.trim() || undefined,
    });

    try {
      if (editingId) {
        await api(`/notes/${editingId}`, { method: "PATCH", body });
      } else {
        await api("/notes", { method: "POST", body });
      }
      resetEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your note");
    }
  }

  async function togglePin(note: Note) {
    setBusyNoteId(note.id);
    try {
      await api(`/notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update note");
    } finally {
      setBusyNoteId(null);
    }
  }

  async function remove(note: Note) {
    if (!window.confirm(`Delete "${note.title}"?`)) return;

    setBusyNoteId(note.id);
    try {
      await api(`/notes/${note.id}`, { method: "DELETE" });
      if (editingId === note.id) resetEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete note");
    } finally {
      setBusyNoteId(null);
    }
  }

  const orderedNotes = [...notes].sort(
    (first, second) => Number(second.pinned) - Number(first.pinned)
  );
  const filteredNotes = orderedNotes.filter(note => {
    const searchText = `${note.title} ${note.content} ${note.category ?? ""}`.toLowerCase();
    return searchText.includes(query.trim().toLowerCase());
  });
  const pinnedCount = notes.filter(note => note.pinned).length;

  return (
    <section className="notes-page">
      <div className="notes-hero">
        <div className="notes-hero-copy">
          <span className="notes-eyebrow"><FileText /> YOUR PERSONAL SPACE</span>
          <h3>Keep your thoughts together.</h3>
          <p>Save ideas, reminders, and the little things you don’t want to forget.</p>
        </div>
        <div className="notes-summary">
          <div><strong>{notes.length}</strong><span>{notes.length === 1 ? "note saved" : "notes saved"}</span></div>
          <div><strong>{pinnedCount}</strong><span>{pinnedCount === 1 ? "pinned note" : "pinned notes"}</span></div>
        </div>
      </div>
      <Card title={editingId ? "Update your note" : "Write a new note"}>
        <form
          className="notes-editor"
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="notes-editor-fields">
            <input
              aria-label="Note title"
              placeholder="Give your note a title"
              maxLength={200}
              value={title}
              onChange={event => setTitle(event.target.value)}
            />
            <input
              aria-label="Note category"
              placeholder="Category (optional)"
              maxLength={80}
              value={category}
              onChange={event => setCategory(event.target.value)}
            />
          </div>
          <textarea
            aria-label="Note content"
            placeholder="Write down an idea, reminder, or anything worth keeping..."
            maxLength={10000}
            value={content}
            onChange={event => setContent(event.target.value)}
          />
          <div className="notes-editor-actions">
            {editingId && (
              <button type="button" className="secondary" onClick={resetEditor}>
                <X /> Cancel
              </button>
            )}
            <button className="primary" type="submit" disabled={!title.trim() || !content.trim()}>
              {editingId ? <Save /> : <Plus />}
              {editingId ? "Save changes" : "Save note"}
            </button>
          </div>
        </form>
      </Card>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="notes-library-header">
        <div>
          <h3>Your library</h3>
          <p>{filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}{query.trim() ? " found" : ""}</p>
        </div>
        <label className="notes-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search your notes"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="notes-grid">
        {loading ? (
          <SkeletonStatus label="Loading notes" className="notes-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} title="Loading note">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                  <Skeleton variant="line" />
                </div>
              </Card>
            ))}
          </SkeletonStatus>
        ) : filteredNotes.map(note => (
          <Card key={note.id} title={note.title}>
            <article className="note-card">
              <div className="note-meta">
                {note.category && <span className="note-category">{note.category}</span>}
                {note.pinned && <span className="note-pinned"><Pin /> Pinned</span>}
              </div>
              <p className="note-content">{note.content}</p>
              <small className="note-date">
                Updated {new Date(note.updatedAt).toLocaleDateString()}
              </small>
              <div className="note-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busyNoteId === note.id}
                  onClick={() => void togglePin(note)}
                >
                  <Pin /> {note.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busyNoteId === note.id}
                  onClick={() => edit(note)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="note-delete"
                  disabled={busyNoteId === note.id}
                  aria-label={`Delete ${note.title}`}
                  onClick={() => void remove(note)}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          </Card>
        ))}
        {!loading && !filteredNotes.length && (
          <div className="notes-empty">
            <span>{query.trim() ? <Search /> : <Plus />}</span>
            <strong>{query.trim() ? "No notes match your search" : "No notes yet"}</strong>
            <p>{query.trim() ? "Try a different title, category, or keyword." : "Your saved ideas and reminders will show up here."}</p>
          </div>
        )}
      </div>
    </section>
  );
}