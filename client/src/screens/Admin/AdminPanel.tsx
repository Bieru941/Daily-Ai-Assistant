import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Goal,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import Card from "@/components/common/Card";
import { Skeleton } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type AdminOverview = {
  users: number;
  tasks: number;
  completedTasks: number;
  events: number;
  goals: number;
  notes: number;
  conversations: number;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  _count: {
    tasks: number;
    events: number;
    notes: number;
    goals: number;
  };
};

type AdminUsersResponse = {
  users: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const metrics = [
  ["Users", "users", Users],
  ["Tasks", "tasks", BarChart3],
  ["Completed tasks", "completedTasks", ShieldCheck],
  ["Events", "events", CalendarDays],
  ["Goals", "goals", Goal],
  ["Notes", "notes", FileText],
  ["Conversations", "conversations", MessageSquare],
] as const;

export default function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [result, setResult] = useState<AdminUsersResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      setOverview(await api<AdminOverview>("/admin/overview"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin overview");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    try {
      setResult(await api<AdminUsersResponse>(`/admin/users?${params.toString()}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoadingUsers(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-intro">
        <div className="admin-panel-icon"><ShieldCheck aria-hidden="true" /></div>
        <div>
          <h3>Platform overview</h3>
          <p>Administrative statistics and account directory.</p>
        </div>
        <button
          type="button"
          className="secondary admin-refresh"
          onClick={() => {
            void loadOverview();
            void loadUsers();
          }}
          disabled={loadingOverview || loadingUsers}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="admin-metrics">
        {metrics.map(([label, key, Icon]) => (
          <Card key={key} title={label}>
            <div className="admin-metric">
              <span className="admin-metric-icon"><Icon size={19} aria-hidden="true" /></span>
              <strong className="metric">{loadingOverview ? <Skeleton variant="line" className="skeleton-metric-value" /> : overview?.[key] ?? 0}</strong>
            </div>
          </Card>
        ))}
      </div>

      <Card title="User directory">
        <p className="admin-directory-description">
          Search accounts and view their registration date and productivity data counts.
        </p>
        <form className="admin-search" onSubmit={submitSearch}>
          <label className="admin-search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              maxLength={100}
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="Search by name or email"
              aria-label="Search users by name or email"
            />
          </label>
          <button className="primary" type="submit"><Search size={16} /> Search</button>
        </form>

        <div className="admin-table-wrap" aria-busy={loadingUsers}>
          <table className="admin-users-table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Joined</th>
                <th scope="col">Tasks</th>
                <th scope="col">Events</th>
                <th scope="col">Goals</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers
                ? Array.from({ length: 5 }, (_, index) => (
                    <tr key={`skeleton-${index}`}>
                      <td><Skeleton variant="line" /><Skeleton variant="line" className="skeleton-short" /></td>
                      <td><Skeleton variant="line" /></td>
                      <td><Skeleton variant="line" /></td>
                      <td><Skeleton variant="line" /></td>
                      <td><Skeleton variant="line" /></td>
                      <td><Skeleton variant="line" /></td>
                    </tr>
                  ))
                : result?.users.map(user => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </td>
                      <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td>{user._count.tasks}</td>
                      <td>{user._count.events}</td>
                      <td>{user._count.goals}</td>
                      <td>{user._count.notes}</td>
                    </tr>
              ))}
            </tbody>
          </table>
          {!loadingUsers && result?.users.length === 0 && (
            <p className="empty">{search ? "No accounts match this search." : "No accounts found."}</p>
          )}
          {loadingUsers && <span className="sr-only" role="status">Loading accounts…</span>}
        </div>

        <div className="admin-pagination">
          <span>
            {result ? `${result.total} account${result.total === 1 ? "" : "s"} · Page ${result.page} of ${Math.max(result.totalPages, 1)}` : " "}
          </span>
          <div>
            <button
              type="button"
              className="secondary"
              aria-label="Previous user page"
              disabled={loadingUsers || page <= 1}
              onClick={() => setPage(current => Math.max(current - 1, 1))}
            >
              <ChevronLeft size={17} /> Previous
            </button>
            <button
              type="button"
              className="secondary"
              aria-label="Next user page"
              disabled={loadingUsers || !result || page >= result.totalPages}
              onClick={() => setPage(current => current + 1)}
            >
              Next <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </Card>
    </section>
  );
}
