export type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  priority: "HIGH" | "MEDIUM" | "LOW";
  category?: string;
  dueAt?: string | null;
};
