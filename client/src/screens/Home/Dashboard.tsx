import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Sparkles,
  Target,
} from "lucide-react";
import Card from "@/components/common/Card";
import { Skeleton, SkeletonStatus } from "@/components/common/Skeleton";
import TaskList from "@/components/cards/TaskList";
import { api } from "@/services/api";
import type { UiCustomization } from "@/theme/appearance";
import type { Task } from "@/types/task";
import type { NavigationPage } from "@/navigation/types";

type Data = {
  tasks: Task[];
  taskCounts: Partial<Record<Task["status"], number>>;
  activeGoalCount: number;
  events: { id: string; title: string; startAt: string }[];
  goals: { id: string; title: string; progress: number }[];
  reminders: { id: string; title: string; remindAt: string }[];
};

export default function Dashboard({
  go,
  appearance,
}: {
  go: (page: NavigationPage) => void;
  appearance: UiCustomization;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true); // ✅ Ipakita habang nagliload

  async function load() {
    try {
      setLoading(true);
      setData(await api<Data>("/dashboard"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false); // ✅ Tapos na mag-load
    }
  }

  useEffect(() => { 
    void load(); 
  }, []);

  const tasks = data?.tasks ?? [];
  const completed = data?.taskCounts.COMPLETED ?? tasks.filter(task => task.status === "COMPLETED").length;
  const totalTasks = Object.values(data?.taskCounts ?? {}).reduce((total, count) => total + (count ?? 0), 0);
  const activeGoalCount = data?.activeGoalCount ?? (data?.goals ?? []).filter(goal => goal.progress < 100).length;
  const progress = totalTasks ? Math.round(completed / totalTasks * 100) : 0;
  const visibleWidgets = appearance.widgetOrder.filter(widget =>
    appearance.visibleWidgets.includes(widget)
  );

  // Habang naghihintay
  if (loading) {
    return (
      <section className="dashboard-loading">
        <SkeletonStatus label="Loading dashboard">
          <div className="skeleton-dashboard-hero">
            <div className="skeleton-dashboard-hero-copy">
              <Skeleton variant="line" className="skeleton-short" />
              <Skeleton variant="title" />
              <Skeleton variant="line" />
            </div>
            <Skeleton variant="button" />
          </div>
          <div className={`dashboard-personalized-grid layout-${appearance.dashboardLayout}`}>
            {(appearance.visibleWidgets.length ? appearance.visibleWidgets : appearance.widgetOrder.slice(0, 3)).map(widget => (
              <Card key={widget} title="Loading">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                  <Skeleton variant="line" />
                </div>
              </Card>
            ))}
          </div>
        </SkeletonStatus>
      </section>
    );
  }

  return (
    <section>
      <div className="hero">
        <div>
          <span className="pill">{new Date().toLocaleDateString()}</span>
          <h1>{appearance.greeting || "Your day, organized."}</h1>
          <p>Focus on what matters and let your assistant help you plan.</p>
        </div>
        <button className="primary" onClick={() => go("AI Assistant")}>
          <Sparkles /> Create My Day
        </button>
      </div>

      {error && (
        <p className="error">{error}</p>
      )}

      {data && visibleWidgets.length > 0 && (
        <div className={`dashboard-personalized-grid layout-${appearance.dashboardLayout}`}>
          {visibleWidgets.map(widget => {
            switch (widget) {
              case "progress":
                return (
                  <Card key={widget} title="Task completion" action={<button className="dashboard-card-action" onClick={() => go("Tasks")} aria-label="Open tasks">Open</button>}>
                    <div className="dashboard-stat">
                      <span className="dashboard-stat-icon violet"><CheckCircle2 /></span>
                      <div>
                        <strong className="dashboard-stat-value">{progress}%</strong>
                        <small>{completed} of {totalTasks} tasks completed</small>
                      </div>
                    </div>
                    <div className="progress" role="progressbar" aria-label="Today's task progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </Card>
                );
              case "schedule":
                return (
                  <Card key={widget} title="Upcoming schedule" action={<button className="dashboard-card-action" onClick={() => go("Calendar")} aria-label="Open calendar">Open</button>}>
                    <div className="dashboard-stat">
                      <span className="dashboard-stat-icon blue"><CalendarDays /></span>
                      <div>
                        <strong className="dashboard-stat-value">
                          {data.events?.[0]?.startAt
                            ? new Date(data.events[0].startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                            : "All clear"}
                        </strong>
                        <small>{data.events?.[0]?.title || "Nothing on your calendar"}</small>
                      </div>
                    </div>
                  </Card>
                );
              case "goals":
                return (
                  <Card key={widget} title="Daily goals" action={<button className="dashboard-card-action" onClick={() => go("Goals")} aria-label="Open goals">Open</button>}>
                    <div className="dashboard-stat">
                      <span className="dashboard-stat-icon amber"><Target /></span>
                      <div>
                        <strong className="dashboard-stat-value">{activeGoalCount}</strong>
                        <small>{activeGoalCount === 1 ? "active goal to keep in sight" : "active goals to keep in sight"}</small>
                      </div>
                    </div>
                  </Card>
                );
              case "tasks":
                return (
                  <Card key={widget} title="Today's tasks" action={<button className="dashboard-card-action" onClick={() => go("Tasks")} aria-label="Open tasks">Open</button>}>
                    <TaskList tasks={tasks} compact onChange={() => void load()} />
                    {tasks.length > 6 && <button className="dashboard-more" onClick={() => go("Tasks")}>View all tasks <ArrowUpRight /></button>}
                  </Card>
                );
              case "reminders":
                return (
                  <Card key={widget} title="Upcoming reminders" action={<button className="dashboard-card-action" onClick={() => go("Reminders")} aria-label="Open reminders">Open</button>}>
                    <div className="list">
                      {(data.reminders ?? []).slice(0, 5).map(reminder => (
                        <div className="row" key={reminder.id}>
                          <span className="reminder-icon"><Clock3 /></span>
                          <div>
                            <b>{reminder.title}</b>
                            <small>{new Date(reminder.remindAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
                          </div>
                        </div>
                      ))}
                      {!data.reminders?.length && <p className="empty">No reminders yet.</p>}
                    </div>
                    {!!data.reminders?.length && <button className="dashboard-more" onClick={() => go("Reminders")}>View reminders <ArrowUpRight /></button>}
                  </Card>
                );
            }
          })}
        </div>
      )}
      {data && visibleWidgets.length === 0 && (
        <Card title="Your dashboard is clear">
          <p className="empty">All dashboard widgets are hidden.</p>
          <button className="secondary" onClick={() => go("Settings")}>Choose dashboard widgets</button>
        </Card>
      )}
    </section>
  );
}