import { lazy, Suspense, useEffect, useState } from "react";

import AuthenticatedLayout from "@/components/layouts/AuthenticatedLayout";
import LoadingScreen from "@/components/common/LoadingScreen";
import Auth from "@/screens/Auth/Auth";
import { api, ApiError } from "@/services/api";
import { alertDueReminders, setQuietHours, unlockSound } from "@/services/sound";
import {
  appearanceFromPreferences,
  DEFAULT_UI_CUSTOMIZATION,
  readSavedAppearance,
  saveAppearanceLocally,
  type UiCustomization,
} from "@/theme/appearance";
import { adminNavigation, navigation, pageFromPath, routeSlugs } from "./routes";
import type { NavigationPage } from "./types";
import type { AuthenticatedUser, NotificationPreferences } from "@/types/user";

const Dashboard = lazy(() => import("@/screens/Home/Dashboard"));
const Tasks = lazy(() => import("@/screens/Tasks/Tasks"));
const Chat = lazy(() => import("@/screens/Assistant/Chat"));
const Calendar = lazy(() => import("@/screens/Calendar/Calendar"));
const Reminders = lazy(() => import("@/screens/Reminders/Reminders"));
const Notes = lazy(() => import("@/screens/Notes/Notes"));
const Goals = lazy(() => import("@/screens/Goals/Goals"));
const Study = lazy(() => import("@/screens/Study/Study"));
const Productivity = lazy(() => import("@/screens/Productivity/Productivity"));
const SettingsPage = lazy(() => import("@/screens/Settings/SettingsPage"));
const AdminPanel = lazy(() => import("@/screens/Admin/AdminPanel"));

export default function AppNavigator() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [page, setPage] = useState<NavigationPage>(() => pageFromPath(window.location.pathname) ?? "Dashboard");
  const [appearance, setAppearance] = useState<UiCustomization>(readSavedAppearance);
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [checking, setChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [error, setError] = useState("");
  const [reminderSoundError, setReminderSoundError] = useState("");

  async function refreshUser() {
    const response = await api<AuthenticatedUser | { user: AuthenticatedUser }>("/me");
    const result = "user" in response ? response.user : response;
    if (!result?.email) throw new Error("User session was not found.");

    setUser(result);
    const startupPages = navigation.map(([name]) => name);
    const savedStartupPage = result.preferences?.startupPage;
    const requestedPage = pageFromPath(window.location.pathname);
    const initialPage = requestedPage && (requestedPage !== "Admin Panel" || result.isAdmin)
      ? requestedPage
      : startupPages.find(name => name === savedStartupPage) ?? "Dashboard";
    setPage(initialPage);
    if (requestedPage !== initialPage) {
      window.history.replaceState(null, "", `/${routeSlugs[initialPage]}`);
    }
    const loadedAppearance = appearanceFromPreferences(
      result.preferences?.theme,
      result.preferences?.uiCustomization,
    );
    setAppearance(loadedAppearance);
    saveAppearanceLocally(loadedAppearance);
  }

  async function checkSession() {
    setStartupError("");
    try {
      await refreshUser();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setStartupError(e instanceof Error ? e.message : "Could not load your session.");
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setAppearance(DEFAULT_UI_CUSTOMIZATION);
      setPage("Dashboard");
      window.history.replaceState(null, "", "/");
      setLoggingOut(false);
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const requestedPage = pageFromPath(window.location.pathname);
      const nextPage = requestedPage === "Admin Panel" && !user?.isAdmin
        ? "Dashboard"
        : requestedPage ?? "Dashboard";
      setPage(nextPage);
      if (requestedPage !== nextPage) {
        window.history.replaceState(null, "", `/${routeSlugs[nextPage]}`);
      }
      if (nextPage === "Settings" && window.location.hash) {
        window.dispatchEvent(new CustomEvent("settings:section", {
          detail: window.location.hash.slice(1),
        }));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [user?.isAdmin]);

  function navigateTo(nextPage: NavigationPage, section?: string) {
    if (!routeSlugs[nextPage] || (nextPage === "Admin Panel" && !user?.isAdmin)) return;
    const nextUrl = `/${routeSlugs[nextPage]}${section ? `#${section}` : ""}`;
    if (`${window.location.pathname}${window.location.hash}` !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
    setPage(nextPage);
    if (section) {
      window.dispatchEvent(new CustomEvent("settings:section", { detail: section }));
    }
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const preference = user?.preferences?.notificationPreferences;
    setQuietHours({
      enabled: preference?.quietHoursEnabled === true,
      start: preference?.quietHoursStart ?? "22:00",
      end: preference?.quietHoursEnd ?? "08:00",
    });
  }, [user?.preferences?.notificationPreferences]);

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    if (!user) {
      setReminderSoundError("");
      return;
    }

    let active = true;
    let checkingReminders = false;
    const enableAudio = () => {
      unlockSound();
      window.removeEventListener("pointerdown", enableAudio);
      window.removeEventListener("keydown", enableAudio);
    };
    const checkReminders = async () => {
      if (checkingReminders || document.visibilityState === "hidden") return;
      checkingReminders = true;
      try {
        const reminders = await api<{ id: string; remindAt: string; recurrence?: string }[]>("/reminders");
        if (active) {
          alertDueReminders(reminders);
          setReminderSoundError("");
        }
      } catch {
        if (active) setReminderSoundError("Could not check due reminders for sound alerts.");
      } finally {
        checkingReminders = false;
      }
    };

    window.addEventListener("pointerdown", enableAudio);
    window.addEventListener("keydown", enableAudio);
    const interval = window.setInterval(() => void checkReminders(), 30_000);
    document.addEventListener("visibilitychange", checkReminders);
    void checkReminders();

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkReminders);
      window.removeEventListener("pointerdown", enableAudio);
      window.removeEventListener("keydown", enableAudio);
    };
  }, [user?.email, user?.preferences?.notificationPreferences]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setAppearance(DEFAULT_UI_CUSTOMIZATION);
      setPage("Dashboard");
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setError(e instanceof Error ? e.message : "Logout failed. Please try again.");
      }
    } finally {
      setLoggingOut(false);
    }
  }

  const visibleNavigation = user?.isAdmin
    ? [...navigation, adminNavigation]
    : navigation;

  const dark = appearance.themeMode === "dark" ||
    appearance.themeMode === "amoled" ||
    (appearance.themeMode === "system" && systemDark);

  function toggleTheme() {
    const nextTheme: UiCustomization["themeMode"] = dark ? "light" : "dark";
    const nextAppearance = { ...appearance, themeMode: nextTheme };
    setAppearance(nextAppearance);
    saveAppearanceLocally(nextAppearance);
    void api("/preferences", {
      method: "PATCH",
      body: JSON.stringify({ theme: nextTheme }),
    }).catch(e => {
      setError(e instanceof Error ? e.message : "Could not save theme");
    });
  }

  function renderPage() {
    switch (page) {
      case "Dashboard": return <Dashboard go={navigateTo} appearance={appearance} />;
      case "AI Assistant": return <Chat />;
      case "Tasks": return <Tasks />;
      case "Calendar": return <Calendar />;
      case "Reminders": return <Reminders />;
      case "Notes": return <Notes />;
      case "Goals": return <Goals />;
      case "Study Mode": return <Study go={navigateTo} />;
      case "Productivity": return <Productivity />;
      case "Settings":
        return (
          <SettingsPage
            user={user!}
            onUserChange={updated => setUser(current => current ? { ...current, ...updated } : current)}
            onNotificationPreferencesChange={preferences => {
              setUser(current => current ? {
                ...current,
                preferences: { ...current.preferences, notificationPreferences: preferences },
              } : current);
            }}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            onLogout={logout}
            loggingOut={loggingOut}
          />
        );
      case "Admin Panel":
        return user?.isAdmin ? <AdminPanel /> : <Dashboard go={navigateTo} appearance={appearance} />;
      default: return <Dashboard go={navigateTo} appearance={appearance} />;
    }
  }

  if (checking || authLoading) {
    return (
      <LoadingScreen
        message={
          authLoading
            ? "Signing you in..."
            : "Preparing your workspace..."
        }
        appearance={appearance}
        dark={dark}
      />
    );
  }

  if (startupError) {
    return (
      <LoadingScreen
        error={startupError}
        onRetry={() => {
          setChecking(true);
          void checkSession();
        }}
        appearance={appearance}
        dark={dark}
      />
    );
  }
    
  if (!user) {
    return (
      <Auth
        dark={dark}
        onLogin={async (authenticatedUser) => {
          setUser(authenticatedUser);
          setAppearance(DEFAULT_UI_CUSTOMIZATION);
          setPage("Dashboard");
          window.history.replaceState(null, "", "/");
          try {
            await refreshUser();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load your profile");
          }
        }}
        onLoadingChange={setAuthLoading}
      />
    );
  }


  return (
    <AuthenticatedLayout
      user={user}
      page={page}
      visibleNavigation={visibleNavigation}
      appearance={appearance}
      dark={dark}
      loggingOut={loggingOut}
      error={error}
      reminderSoundError={reminderSoundError}
      onNavigate={navigateTo}
      onLogout={() => void logout()}
      onToggleTheme={toggleTheme}
    >
      <Suspense
        fallback={
          <LoadingScreen message={`Loading ${page}...`} appearance={appearance} dark={dark} />
        }
      >
        {renderPage()}
      </Suspense>
    </AuthenticatedLayout>
  );
}