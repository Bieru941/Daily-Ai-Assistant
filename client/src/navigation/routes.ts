import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CheckSquare,
  Clock3,
  FileText,
  Home,
  Settings,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { NavigationPage } from "./types";

export type NavigationItem = readonly [NavigationPage, LucideIcon];

export const navigation = [
  ["Dashboard", Home],
  ["AI Assistant", Bot],
  ["Tasks", CheckSquare],
  ["Calendar", CalendarDays],
  ["Reminders", Clock3],
  ["Notes", FileText],
  ["Goals", Target],
  ["Study Mode", BookOpen],
  ["Productivity", BarChart3],
  ["Settings", Settings],
] as const satisfies readonly NavigationItem[];

export const adminNavigation = ["Admin Panel", ShieldCheck] as const satisfies NavigationItem;

export const primaryMobileNavigation = [
  ["Dashboard", Home],
  ["AI Assistant", Bot],
  ["Tasks", CheckSquare],
  ["Calendar", CalendarDays],
] as const satisfies readonly NavigationItem[];

export const routeSlugs: Record<NavigationPage, string> = {
  Dashboard: "dashboard",
  "AI Assistant": "ai-assistant",
  Tasks: "tasks",
  Calendar: "calendar",
  Reminders: "reminders",
  Notes: "notes",
  Goals: "goals",
  "Study Mode": "study",
  Productivity: "productivity",
  Settings: "settings",
  "Admin Panel": "admin",
};

export function pageFromPath(pathname: string): NavigationPage | null {
  const route = pathname.replace(/\/+$/, "").split("/").pop()?.toLowerCase();
  return Object.entries(routeSlugs).find(([, slug]) => slug === route)?.[0] as NavigationPage | undefined ?? null;
}
