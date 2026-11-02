import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Card from "@/components/common/Card";
import { Skeleton, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";

type ProductivityStats = {
  completed: number;
  remaining: number;
  completionRate: number;
  studyMinutes: number;
  focusSessions: number;
  weeklyCompleted: { day: string; completed: number }[];
};

export default function Productivity() {
  const [stats, setStats] = useState<ProductivityStats>({
    completed: 0,
    remaining: 0,
    completionRate: 0,
    studyMinutes: 0,
    focusSessions: 0,
    weeklyCompleted: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ProductivityStats>("/productivity")
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : "Could not load statistics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section>
        <SkeletonStatus label="Loading productivity statistics">
          <div className="grid three">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} title="Loading statistic">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                </div>
              </Card>
            ))}
          </div>
          <div className="grid two">
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index} title="Loading statistic">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                </div>
              </Card>
            ))}
          </div>
          <Card title="Tasks completed this week">
            <Skeleton variant="block" className="skeleton-chart" />
          </Card>
        </SkeletonStatus>
      </section>
    );
  }

  return (
    <section>
      {error && <p className="error">{error}</p>}
      <div className="grid three">
        <Card title="Completed"><strong className="metric">{stats.completed}</strong></Card>
        <Card title="Remaining"><strong className="metric">{stats.remaining}</strong></Card>
        <Card title="Completion rate"><strong className="metric">{stats.completionRate}%</strong></Card>
      </div>
      <div className="grid two">
        <Card title="Focus sessions"><strong className="metric">{stats.focusSessions}</strong></Card>
        <Card title="Study time"><strong className="metric">{stats.studyMinutes} min</strong></Card>
      </div>
      <Card title="Tasks completed this week">
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.weeklyCompleted}>
              <XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}