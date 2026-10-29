import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  Accessibility,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  CheckCircle2,
  CircleHelp,
  Download,
  Eye,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
  Volume2,
} from "lucide-react";
import Card from "@/components/common/Card";
import daymateLogo from "@/assets/images/Daymate-logo.png";
import { Skeleton, SkeletonRows, SkeletonStatus } from "@/components/common/Skeleton";
import { api } from "@/services/api";
import { isSoundEnabled, playSound, saveSoundEnabled } from "@/services/sound";
import type { NotificationPreferences, UserProfile } from "@/types/user";
import {
  accentForeground,
  accentHex,
  appearanceFromPreferences,
  DASHBOARD_WIDGETS,
  DEFAULT_UI_CUSTOMIZATION,
  normalizeUiCustomization,
  saveAppearanceLocally,
  type AccentColor,
  type AnimationIntensity,
  type DashboardLayout,
  type DashboardWidget,
  type UiCustomization,
  type VisualStyle,
} from "@/theme/appearance";

type Personality = "friendly" | "professional" | "casual" | "concise" | "detailed";
type ResponseStyle = "short" | "balanced" | "detailed";
type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};
type SettingsPageProps = {
  user: UserProfile;
  onUserChange: (user: UserProfile) => void;
  appearance: UiCustomization;
  onAppearanceChange: (appearance: UiCustomization) => void;
  onNotificationPreferencesChange: (preferences: NotificationPreferences) => void;
  onLogout: () => void;
  loggingOut: boolean;
};

const PERSONALITIES: { value: Personality; label: string; description: string }[] = [
  { value: "friendly", label: "Friendly", description: "Warm, casual, and easy to talk to." },
  { value: "professional", label: "Professional", description: "Clear, formal, and focused on results." },
  { value: "casual", label: "Casual", description: "Natural and relaxed conversational language." },
  { value: "concise", label: "Concise", description: "Brief answers focused on the essentials." },
  { value: "detailed", label: "Detailed", description: "Thorough explanations with useful context." },
];
const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  inApp: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};

const ACCENTS: { value: AccentColor; label: string; color: string }[] = [
  { value: "electric-blue", label: "Electric Blue", color: "#3976c4" },
  { value: "purple", label: "Purple", color: "#7357e8" },
  { value: "emerald", label: "Emerald Green", color: "#248768" },
  { value: "sunset", label: "Sunset Orange", color: "#d87827" },
  { value: "rose", label: "Rose Pink", color: "#cf5573" },
  { value: "cyan", label: "Cyan", color: "#148a91" },
];

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="appearance-choice-group" role="group" aria-label={label}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          className={`appearance-choice${value === option.value ? " selected" : ""}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span className="appearance-choice-check" aria-hidden="true">
            {value === option.value && <Check size={13} />}
          </span>
          <span className="appearance-choice-copy">
            <strong>{option.label}</strong>
            {option.description && <small>{option.description}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

function SettingSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <section className="appearance-section" id={id} aria-labelledby={`${id}-title`}>
        <div className="appearance-section-heading">
          <span className="appearance-section-icon">{icon}</span>
          <div>
            <h3 id={`${id}-title`}>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function SettingsCategory({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-category" id={id} aria-labelledby={`${id}-title`}>
      <div className="settings-category-heading">
        <span className="settings-category-icon">{icon}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-category-content">{children}</div>
    </section>
  );
}

const SETTINGS_CATEGORIES = [
  ["account-profile", "Account & Profile"],
  ["ai-behavior", "AI Behavior"],
  ["custom-ui", "Custom UI & Appearance"],
  ["personalization", "Personalization"],
  ["notifications", "Notifications"],
  ["privacy-security", "Privacy & Security"],
  ["performance-startup", "Performance & Startup"],
  ["accessibility", "Accessibility"],
  ["help-about", "Help & About"],
] as const;

export default function SettingsPage({
  user,
  onUserChange,
  appearance,
  onAppearanceChange,
  onNotificationPreferencesChange,
  onLogout,
  loggingOut,
}: SettingsPageProps) {
  const [draft, setDraft] = useState(appearance);
  const [savedAppearance, setSavedAppearance] = useState(appearance);
  const [personality, setPersonality] = useState<Personality>("friendly");
  const [savedPersonality, setSavedPersonality] = useState<Personality>("friendly");
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>("balanced");
  const [savedResponseStyle, setSavedResponseStyle] = useState<ResponseStyle>("balanced");
  const [language, setLanguage] = useState("en");
  const [savedLanguage, setSavedLanguage] = useState("en");
  const [customInstructions, setCustomInstructions] = useState("");
  const [savedCustomInstructions, setSavedCustomInstructions] = useState("");
  const [startupPage, setStartupPage] = useState("Dashboard");
  const [savedStartupPage, setSavedStartupPage] = useState("Dashboard");
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_NOTIFICATIONS);
  const [savedNotificationPreferences, setSavedNotificationPreferences] = useState(DEFAULT_NOTIFICATIONS);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(isSoundEnabled);
  const [profileName, setProfileName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"feedback" | "bug">("feedback");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(SETTINGS_CATEGORIES[0][0]);
  const toastTimer = useRef<number | undefined>(undefined);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedAppearance) ||
    personality !== savedPersonality ||
    responseStyle !== savedResponseStyle ||
    language !== savedLanguage ||
    customInstructions !== savedCustomInstructions ||
    startupPage !== savedStartupPage ||
    JSON.stringify(notificationPreferences) !== JSON.stringify(savedNotificationPreferences);

  useEffect(() => {
    if (loading) return;
    const requestedSection = window.location.hash.slice(1);
    if (requestedSection) {
      document.getElementById(decodeURIComponent(requestedSection))?.scrollIntoView({ behavior: "smooth" });
    }
    const onSectionNavigation = (event: Event) => {
      const section = (event as CustomEvent<string>).detail;
      if (typeof section === "string") {
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("settings:section", onSectionNavigation);

    const sections = SETTINGS_CATEGORIES
      .map(([id]) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(entries => {
      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visibleSections[0]) setActiveCategory(visibleSections[0].target.id);
    }, { rootMargin: "-20% 0px -70% 0px" });

    sections.forEach(section => observer.observe(section));
    return () => {
      observer.disconnect();
      window.removeEventListener("settings:section", onSectionNavigation);
    };
  }, [loading]);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      try {
        const data = await api<{
          theme?: string;
          personality?: string;
          responseStyle?: string;
          language?: string;
          customInstructions?: string;
          startupPage?: string;
          notificationPreferences?: Partial<NotificationPreferences>;
          uiCustomization?: unknown;
        }>("/preferences");
        if (!active) return;

        const loadedAppearance = appearanceFromPreferences(data.theme, data.uiCustomization);
        const loadedPersonality = PERSONALITIES.some(item => item.value === data.personality)
          ? data.personality as Personality
          : "friendly";
        const loadedResponseStyle = ["short", "balanced", "detailed"].includes(data.responseStyle ?? "")
          ? data.responseStyle as ResponseStyle
          : "balanced";
        const loadedNotifications = {
          ...DEFAULT_NOTIFICATIONS,
          ...(data.notificationPreferences ?? {}),
        };
        const loadedStartupPage = [
          "Dashboard", "AI Assistant", "Tasks", "Calendar", "Reminders",
          "Notes", "Goals", "Study Mode", "Productivity", "Settings",
        ].includes(data.startupPage ?? "") ? data.startupPage! : "Dashboard";
        setDraft(loadedAppearance);
        setSavedAppearance(loadedAppearance);
        setPersonality(loadedPersonality);
        setSavedPersonality(loadedPersonality);
        setResponseStyle(loadedResponseStyle);
        setSavedResponseStyle(loadedResponseStyle);
        setLanguage(data.language || "en");
        setSavedLanguage(data.language || "en");
        setCustomInstructions(data.customInstructions || "");
        setSavedCustomInstructions(data.customInstructions || "");
        setStartupPage(loadedStartupPage);
        setSavedStartupPage(loadedStartupPage);
        setNotificationPreferences(loadedNotifications);
        setSavedNotificationPreferences(loadedNotifications);
        onAppearanceChange(loadedAppearance);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your preferences.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPreferences();
    return () => {
      active = false;
      window.clearTimeout(toastTimer.current);
    };
  }, [onAppearanceChange]);

  useEffect(() => {
    let active = true;
    void api<NotificationItem[]>("/notifications")
      .then(items => { if (active) setNotifications(items); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load notification history."); })
      .finally(() => { if (active) setNotificationLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dirty) {
      setDraft(appearance);
      setSavedAppearance(appearance);
    }
  }, [appearance, dirty]);

  function notify(message: string) {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 3000);
  }

  function update<K extends keyof UiCustomization>(key: K, value: UiCustomization[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setError("");
    setToast("");
  }

  function updateAccent(accent: AccentColor) {
    update("accent", accent);
  }

  function moveWidget(widget: DashboardWidget, direction: -1 | 1) {
    const index = draft.widgetOrder.indexOf(widget);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.widgetOrder.length) return;
    const widgetOrder = [...draft.widgetOrder];
    [widgetOrder[index], widgetOrder[nextIndex]] = [widgetOrder[nextIndex], widgetOrder[index]];
    update("widgetOrder", widgetOrder);
  }

  function toggleWidget(widget: DashboardWidget) {
    const visibleWidgets = draft.visibleWidgets.includes(widget)
      ? draft.visibleWidgets.filter(item => item !== widget)
      : [...draft.visibleWidgets, widget];
    update("visibleWidgets", visibleWidgets);
  }

  function applyPreview() {
    onAppearanceChange(draft);
    notify("Preview applied. Save to keep these changes.");
  }

  function cancelChanges() {
    if (dirty && !window.confirm("Discard your unsaved settings changes?")) return;
    setDraft(savedAppearance);
    setPersonality(savedPersonality);
    setResponseStyle(savedResponseStyle);
    setLanguage(savedLanguage);
    setCustomInstructions(savedCustomInstructions);
    setStartupPage(savedStartupPage);
    setNotificationPreferences(savedNotificationPreferences);
    onAppearanceChange(savedAppearance);
    setError("");
    notify("Unsaved changes canceled.");
  }

  function resetToDefaults() {
    if (dirty && !window.confirm("Replace your current unsaved settings with the defaults?")) return;
    setDraft(DEFAULT_UI_CUSTOMIZATION);
    setError("");
    setToast("Defaults are ready to preview or save.");
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    setToast("");
    try {
      await api("/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          theme: draft.themeMode,
          personality,
          responseStyle,
          language,
          customInstructions,
          startupPage,
          notificationPreferences,
          uiCustomization: normalizeUiCustomization(draft),
        }),
      });
      setSavedAppearance(draft);
      setSavedPersonality(personality);
      setSavedResponseStyle(responseStyle);
      setSavedLanguage(language);
      setSavedCustomInstructions(customInstructions);
      setSavedStartupPage(startupPage);
      setSavedNotificationPreferences(notificationPreferences);
      onAppearanceChange(draft);
      onNotificationPreferencesChange(notificationPreferences);
      saveAppearanceLocally(draft);
      notify("Your settings have been saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setAccountBusy(true);
    setError("");
    try {
      const saved = await api<UserProfile>("/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: profileName }),
      });
      onUserChange(saved);
      setProfileName(saved.name);
      notify("Profile updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your profile.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountBusy(true);
    setError("");
    try {
      await api("/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      notify("Password changed. Other active sessions have been signed out.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change your password.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function testNotification() {
    try {
      const item = await api<NotificationItem>("/notifications/test", { method: "POST" });
      setNotifications(current => [item, ...current].slice(0, 100));
      notify("Test notification added to your history.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a test notification.");
    }
  }

  async function markNotificationRead(notification: NotificationItem) {
    try {
      await api(`/notifications/${encodeURIComponent(notification.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ read: !notification.read }),
      });
      setNotifications(current => current.map(item =>
        item.id === notification.id ? { ...item, read: !item.read } : item
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notification.");
    }
  }

  async function clearNotifications() {
    if (!window.confirm("Delete your notification history? This cannot be undone.")) return;
    try {
      await api("/notifications", { method: "DELETE" });
      setNotifications([]);
      notify("Notification history cleared.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear notification history.");
    }
  }

  async function exportData() {
    try {
      const data = await api<unknown>("/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "daily-ai-data.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Your account data export is ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export account data.");
    }
  }

  async function clearConversationHistory() {
    if (!window.confirm("Permanently delete all of your AI conversations and messages?")) return;
    try {
      const result = await api<{ deleted: number }>("/conversations", { method: "DELETE" });
      notify(`${result.deleted} conversation${result.deleted === 1 ? "" : "s"} deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear conversation history.");
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackBusy(true);
    setError("");
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({ message: feedback, category: feedbackCategory }),
      });
      setFeedback("");
      notify("Thanks — your message was sent to support.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  const previewDark = draft.themeMode === "dark" || draft.themeMode === "amoled" ||
    (draft.themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const previewStyle = {
    "--preview-accent": accentHex(draft),
    "--ui-accent": accentHex(draft),
    "--ui-accent-hover": `color-mix(in srgb, ${accentHex(draft)} 85%, black)`,
    "--ui-accent-soft": previewDark
      ? `color-mix(in srgb, ${accentHex(draft)} 25%, #222437)`
      : `color-mix(in srgb, ${accentHex(draft)} 13%, white)`,
    "--ui-accent-contrast": previewDark ? "#f5f5f7" : "#20243a",
    "--ui-accent-foreground": accentForeground(draft),
  } as CSSProperties;

  if (loading) {
    return (
      <section className="settings-page">
        <div className="settings-header">
          <div className="skeleton-settings-heading">
            <Skeleton variant="line" className="skeleton-short" />
            <Skeleton variant="title" />
            <Skeleton variant="line" />
          </div>
        </div>
        <SkeletonStatus label="Loading settings">
          <div className="grid two">
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index} title="Loading profile">
                <div className="skeleton-metric-card">
                  <Skeleton variant="title" />
                  <Skeleton variant="block" />
                  <Skeleton variant="line" />
                </div>
              </Card>
            ))}
          </div>
          <Card title="Appearance settings">
            <div className="skeleton-metric-card">
              <Skeleton variant="title" />
              <SkeletonRows count={4} />
            </div>
          </Card>
        </SkeletonStatus>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <span className="settings-kicker">YOUR WORKSPACE</span>
          <h1>Settings</h1>
          <p>Personalize your workspace and assistant. Appearance and AI preferences are saved together.</p>
        </div>
      </header>

      {error && <div className="settings-alert settings-alert-error" role="alert"><AlertCircle size={19} /><span>{error}</span></div>}
      {toast && <div className="appearance-toast" role="status"><CheckCircle2 size={18} />{toast}</div>}

      <nav className="appearance-category-nav" aria-label="Settings categories">
        {SETTINGS_CATEGORIES.map(([id, label]) => (
          <a
            href={`#${id}`}
            key={id}
            aria-current={activeCategory === id ? "location" : undefined}
            onClick={() => setActiveCategory(id)}
          >
            {label}
          </a>
        ))}
      </nav>

      <SettingsCategory
        id="account-profile"
        title="Account & Profile"
        description="Edit your profile, update account credentials, or sign out securely."
        icon={<UserRound size={20} />}
      >
        <Card
          title="Account information"
          action={
            <button
              type="button"
              className="secondary settings-sign-out"
              onClick={onLogout}
              disabled={loggingOut}
              aria-busy={loggingOut}
            >
              <LogOut size={16} /> {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          }
        >
          <div className="settings-profile">
            <div className="settings-avatar" aria-hidden="true"><UserRound size={28} /></div>
            <div className="settings-profile-details">
              <h3>{user.name || "User"}</h3>
              <p>{user.email}</p>
              <span className="settings-status">
                <CheckCircle2 size={14} />{user.emailVerified ? "Email verified" : "Email not verified"}
              </span>
              {user.createdAt && <p>Member since {new Date(user.createdAt).toLocaleDateString()}</p>}
            </div>
          </div>
          <form className="settings-form" onSubmit={event => { event.preventDefault(); void saveProfile(); }}>
            <label className="settings-label" htmlFor="profile-name">Display name</label>
            <input id="profile-name" className="settings-select" value={profileName} maxLength={80} required onChange={event => setProfileName(event.target.value)} />
            <button type="submit" className="primary" disabled={accountBusy || profileName.trim() === user.name}>
              <Save size={16} /> Save profile
            </button>
          </form>
        </Card>
        <Card title="Change password">
          <form className="settings-form" onSubmit={event => void changePassword(event)}>
            <label className="settings-label" htmlFor="current-password">Current password</label>
            <input id="current-password" className="settings-select" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
            <label className="settings-label" htmlFor="new-password">New password</label>
            <input id="new-password" className="settings-select" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)} />
            <small>Use at least 8 characters. Changing your password signs out other active sessions.</small>
            <button type="submit" className="primary" disabled={accountBusy || newPassword.length < 8}>
              <ShieldCheck size={16} /> Update password
            </button>
          </form>
        </Card>
      </SettingsCategory>

      <SettingsCategory
        id="ai-behavior"
        title="AI Behavior"
        description="Set the style and guidance the assistant applies to future AI responses."
        icon={<Sparkles size={20} />}
      >
        <Card title="AI Preferences">
          <div className="settings-section-heading">
            <Sparkles size={21} aria-hidden="true" />
            <div><h3>Assistant personality</h3><p>Choose how your AI assistant communicates.</p></div>
          </div>
          <label className="settings-label" htmlFor="personality">Personality</label>
          <select
            id="personality"
            className="settings-select"
            value={personality}
            onChange={event => {
              setPersonality(event.target.value as Personality);
              setToast("");
            }}
            disabled={loading || saving}
          >
            {PERSONALITIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <p className="settings-description">{PERSONALITIES.find(option => option.value === personality)?.description}</p>
          <label className="settings-label" htmlFor="response-style">Response length</label>
          <select id="response-style" className="settings-select" value={responseStyle} onChange={event => setResponseStyle(event.target.value as ResponseStyle)}>
            <option value="short">Short</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
          </select>
          <label className="settings-label" htmlFor="preferred-language">Assistant response language</label>
          <select id="preferred-language" className="settings-select" value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option>
            <option value="de">German</option><option value="ja">Japanese</option><option value="zh">Chinese</option>
            <option value="tl">Filipino / Tagalog</option>
          </select>
          <label className="settings-label" htmlFor="custom-ai-instructions">Custom instructions</label>
          <textarea id="custom-ai-instructions" className="settings-select" rows={4} maxLength={2000} value={customInstructions} onChange={event => setCustomInstructions(event.target.value)} placeholder="For example: prefer practical examples and use metric units." />
          <small>{customInstructions.length}/2000 characters. Applied to requests using the configured AI provider.</small>
          <div className="settings-ai-preview" aria-live="polite">
            <strong>Response preview</strong>
            <p>{personality === "concise"
              ? "Here is the key point, followed by one practical next step."
              : personality === "professional"
                ? "The recommended approach is to prioritize the next actionable step."
                : personality === "detailed"
                  ? "Let's work through this carefully. First, identify the goal; next, break it into manageable actions and choose the one with the highest impact."
                  : "Let's make this manageable: start with one small, useful next step."}</p>
          </div>
        </Card>
        <div className="settings-category-save">
          <p className="settings-hint">{dirty ? "You have unsaved settings changes." : "Your settings are up to date."}</p>
          <button type="button" className="primary" onClick={() => void saveSettings()} disabled={saving || !dirty}>
            <Save size={16} /> {saving ? "Saving…" : "Save all settings"}
          </button>
        </div>
      </SettingsCategory>

      <SettingsCategory
        id="custom-ui"
        title="Custom UI & Appearance"
        description="Personalize the workspace theme, color, layout, motion, and overall feel."
        icon={<Palette size={20} />}
      >
      <div className="appearance-settings">
        <SettingSection id="themes" title="Themes" description="Switch the entire workspace instantly. System mode follows your device." icon={<Palette size={20} />}>
          <ChoiceGroup
            label="Application theme"
            value={draft.themeMode}
            options={[
              { value: "light", label: "Light Mode", description: "Bright surfaces for daytime use." },
              { value: "dark", label: "Dark Mode", description: "A softer dark palette for low light." },
              { value: "system", label: "System Default", description: "Follow your operating system setting." },
              { value: "amoled", label: "AMOLED Black", description: "Near-black surfaces for OLED displays." },
            ]}
            onChange={themeMode => update("themeMode", themeMode)}
          />
        </SettingSection>

        <SettingSection id="accent-colors" title="Accent Colors" description="Choose the highlight color used across controls, navigation, and progress." icon={<Palette size={20} />}>
          <div className="appearance-accent-grid" role="group" aria-label="Preset accent colors">
            {ACCENTS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`appearance-accent-card${draft.accent === option.value ? " selected" : ""}`}
                aria-pressed={draft.accent === option.value}
                onClick={() => updateAccent(option.value)}
              >
                <span className="appearance-accent-swatch" style={{ background: option.color }} />
                <span>{option.label}</span>
                {draft.accent === option.value && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <label className="appearance-custom-color">
            <span className="appearance-custom-color-copy"><strong>Custom Color</strong><small>Choose any accessible hex color.</small></span>
            <input
              type="color"
              value={draft.customAccent}
              aria-label="Choose custom accent color"
              onChange={event => {
                update("customAccent", event.target.value);
                updateAccent("custom");
              }}
            />
            <code>{draft.customAccent.toUpperCase()}</code>
          </label>
        </SettingSection>

        <SettingSection id="interface-style" title="Interface Style" description="Adjust the shape, spacing, navigation, and overall visual feel." icon={<LayoutDashboard size={20} />}>
          <div className="appearance-control-grid">
            <div className="appearance-setting-control">
              <strong>Corner style</strong><small>Choose the shape of cards and controls.</small>
              <ChoiceGroup label="Corner style" value={draft.cornerStyle} options={[
                { value: "rounded", label: "Rounded" },
                { value: "moderate", label: "Moderate" },
                { value: "square", label: "Squared" },
              ]} onChange={cornerStyle => update("cornerStyle", cornerStyle)} />
            </div>
            <div className="appearance-setting-control">
              <strong>Layout density</strong><small>Set the space between interface elements.</small>
              <ChoiceGroup label="Layout density" value={draft.density} options={[
                { value: "compact", label: "Compact" },
                { value: "comfortable", label: "Comfortable" },
                { value: "spacious", label: "Spacious" },
              ]} onChange={density => update("density", density)} />
            </div>
            <div className="appearance-setting-control">
              <strong>Navigation</strong><small>Choose a sidebar, bottom bar, or compact top bar.</small>
              <ChoiceGroup label="Navigation style" value={draft.navigation} options={[
                { value: "sidebar", label: "Sidebar" },
                { value: "bottom", label: "Bottom navigation" },
                { value: "top", label: "Top navigation" },
              ]} onChange={navigation => update("navigation", navigation)} />
            </div>
            <div className="appearance-setting-control">
              <strong>Visual style</strong><small>Glass style uses translucent surfaces where supported.</small>
              <ChoiceGroup label="Visual style" value={draft.visualStyle} options={[
                { value: "minimal", label: "Minimalist" },
                { value: "modern", label: "Modern" },
                { value: "glass", label: "Glass-inspired" },
              ]} onChange={visualStyle => update("visualStyle", visualStyle)} />
            </div>
            <div className="appearance-setting-control">
              <strong>Background</strong><small>Choose a calm canvas; gradients can be disabled.</small>
              <ChoiceGroup label="Background style" value={draft.background} options={[
                { value: "plain", label: "Plain" },
                { value: "soft", label: "Soft" },
                { value: "gradient", label: "Gradient" },
                { value: "warm", label: "Warm" },
                { value: "mint", label: "Mint" },
                { value: "lavender", label: "Lavender" },
              ]} onChange={background => update("background", background)} />
            </div>
          </div>
        </SettingSection>

        <SettingSection id="animations-effects" title="Animations & Effects" description="Keep motion polished and restrained, or turn it off entirely." icon={<WandSparkles size={20} />}>
          <label className="appearance-switch-row">
            <span><strong>Enable animations</strong><small>Use subtle transitions and interface feedback.</small></span>
            <input
              type="checkbox"
              checked={draft.animationEnabled}
              onChange={event => {
                update("animationEnabled", event.target.checked);
                if (event.target.checked && draft.animationIntensity === "off") {
                  update("animationIntensity", "subtle");
                }
              }}
            />
          </label>
          <div className="appearance-setting-control">
            <strong>Animation intensity</strong>
            <small>System reduced-motion settings always take priority.</small>
            <ChoiceGroup label="Animation intensity" value={draft.animationIntensity} options={[
              { value: "off", label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "smooth", label: "Smooth" },
            ]} onChange={(animationIntensity: AnimationIntensity) => {
              update("animationIntensity", animationIntensity);
              update("animationEnabled", animationIntensity !== "off");
            }} />
          </div>
          <label className="appearance-switch-row">
            <span><strong>Subtle animated background</strong><small>Animate decorative gradients only when motion is enabled.</small></span>
            <input
              type="checkbox"
              checked={draft.backgroundAnimation}
              disabled={!draft.animationEnabled || draft.animationIntensity === "off"}
              onChange={event => update("backgroundAnimation", event.target.checked)}
            />
          </label>
        </SettingSection>

        <SettingSection id="preview-reset" title="Live Preview & Reset" description="Preview your choices, apply them temporarily, or restore the saved appearance." icon={<Eye size={20} />}>
          <div className={`appearance-preview ui-theme-${draft.themeMode} ui-accent-${draft.accent} ui-density-${draft.density} ui-corners-${draft.cornerStyle} ui-style-${draft.visualStyle} ui-background-${draft.background}${draft.backgroundAnimation ? " ui-background-animated" : ""} ui-navigation-${draft.navigation} ui-animations-${draft.animationEnabled ? draft.animationIntensity : "off"}${draft.highContrast ? " ui-high-contrast" : ""}${previewDark ? " dark" : ""}`} data-ui-font-size={draft.fontSize} style={previewStyle}>
            <div className="appearance-preview-nav">
              <span className="appearance-preview-logo"><img src={daymateLogo} alt="" /></span>
              <span className="appearance-preview-nav-item active">Overview</span>
              <span className="appearance-preview-nav-item">Tasks</span>
              <span className="appearance-preview-nav-item">Settings</span>
            </div>
            <div className="appearance-preview-main" style={{ fontSize: `${draft.interfaceScale}%` }}>
              <div className="appearance-preview-card">
                <small>LIVE PREVIEW</small>
                <strong>{draft.greeting || "Your day, organized."}</strong>
                <p>Theme, color, spacing, and type update here.</p>
                <div className="appearance-preview-progress"><span /></div>
                <button type="button" tabIndex={-1}>Sample button</button>
              </div>
              <div className="appearance-preview-card mini">
                <span>Typography sample</span>
                <small>{draft.fontSize} · {draft.density} · {draft.interfaceScale}%</small>
              </div>
            </div>
          </div>
          <div className="appearance-action-row">
            <p className="settings-hint">
              {dirty ? "You have unsaved changes." : "Your saved appearance is up to date."}
            </p>
            <div>
              <button type="button" className="secondary" onClick={resetToDefaults} disabled={loading || saving}><RotateCcw size={16} /> Reset defaults</button>
              <button type="button" className="secondary" onClick={cancelChanges} disabled={loading || saving || !dirty}>Cancel</button>
              <button type="button" className="secondary" onClick={applyPreview} disabled={loading || saving}><Eye size={16} /> Apply preview</button>
              <button type="button" className="primary" onClick={() => void saveSettings()} disabled={loading || saving || !dirty}>
                <Save size={16} /> {saving ? "Saving…" : "Save all settings"}
              </button>
            </div>
          </div>
        </SettingSection>
      </div>
      </SettingsCategory>

      <SettingsCategory
        id="personalization"
        title="Personalization"
        description="Shape the dashboard around your daily workflow."
        icon={<LayoutDashboard size={20} />}
      >
        <div className="appearance-settings">
        <SettingSection id="dashboard-customization" title="Dashboard & Widgets" description="Choose the dashboard layout, greeting, and visible cards." icon={<LayoutDashboard size={20} />}>
          <label className="appearance-setting-control">
            <strong>Dashboard layout</strong>
            <small>Focus layout uses one column; balanced uses a responsive card grid.</small>
            <ChoiceGroup label="Dashboard layout" value={draft.dashboardLayout} options={[
              { value: "balanced", label: "Balanced" },
              { value: "focus", label: "Focus" },
            ]} onChange={(dashboardLayout: DashboardLayout) => update("dashboardLayout", dashboardLayout)} />
          </label>
          <label className="appearance-setting-control appearance-greeting">
            <strong>Greeting message</strong>
            <small>Customize the dashboard headline.</small>
            <input
              value={draft.greeting}
              maxLength={80}
              onChange={event => update("greeting", event.target.value)}
              placeholder="Your day, organized."
            />
          </label>
          <div className="appearance-widget-list">
            <strong>Dashboard widgets</strong>
            <small>Hide cards or move them into your preferred order.</small>
            {draft.widgetOrder.map((widget, index) => {
              const definition = DASHBOARD_WIDGETS.find(item => item.id === widget)!;
              const visible = draft.visibleWidgets.includes(widget);
              return (
                <div className="appearance-widget-row" key={widget}>
                  <label>
                    <input type="checkbox" checked={visible} onChange={() => toggleWidget(widget)} />
                    <span>{definition.label}</span>
                  </label>
                  <div>
                    <button type="button" aria-label={`Move ${definition.label} up`} disabled={index === 0} onClick={() => moveWidget(widget, -1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Move ${definition.label} down`} disabled={index === draft.widgetOrder.length - 1} onClick={() => moveWidget(widget, 1)}><ArrowDown size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingSection>
        </div>
      </SettingsCategory>

      <SettingsCategory
        id="notifications"
        title="Notifications"
        description="Manage notification behavior and review notifications saved to your account."
        icon={<Bell size={20} />}
      >
        <div className="appearance-settings">
        <SettingSection id="notification-preferences" title="Notification preferences" description="In-app history is stored per account. Quiet hours are saved with your preferences." icon={<Bell size={20} />}>
          <label className="appearance-switch-row">
            <span><strong>In-app notifications</strong><small>Show and keep notifications in your account history.</small></span>
            <input type="checkbox" checked={notificationPreferences.inApp} onChange={event => setNotificationPreferences(current => ({ ...current, inApp: event.target.checked }))} />
          </label>
          <label className="appearance-switch-row">
            <span><strong>Quiet hours</strong><small>Disable notification sounds during the selected time range.</small></span>
            <input type="checkbox" checked={notificationPreferences.quietHoursEnabled} onChange={event => setNotificationPreferences(current => ({ ...current, quietHoursEnabled: event.target.checked }))} />
          </label>
          {notificationPreferences.quietHoursEnabled && (
            <div className="settings-time-range">
              <label>Start quiet hours<input type="time" value={notificationPreferences.quietHoursStart} onChange={event => setNotificationPreferences(current => ({ ...current, quietHoursStart: event.target.value }))} /></label>
              <label>End quiet hours<input type="time" value={notificationPreferences.quietHoursEnd} onChange={event => setNotificationPreferences(current => ({ ...current, quietHoursEnd: event.target.value }))} /></label>
            </div>
          )}
          <button type="button" className="secondary" onClick={() => void testNotification()} disabled={!notificationPreferences.inApp}>
            <Bell size={16} /> Test in-app notification
          </button>
        </SettingSection>
        <SettingSection id="sound-alerts" title="Sound Alerts" description="Hear a quiet tone when a reminder is due or a task is completed." icon={<Volume2 size={20} />}>
          <label className="appearance-switch-row">
            <span><strong>Enable sound alerts</strong><small>Play a sound for due reminders and completed tasks. Saved on this device.</small></span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={event => {
                try {
                  saveSoundEnabled(event.target.checked);
                  setSoundEnabled(event.target.checked);
                  setError("");
                  notify(event.target.checked ? "Sound alerts enabled." : "Sound alerts disabled.");
                } catch {
                  setError("Could not save sound preferences in this browser.");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!soundEnabled}
            onClick={() => {
              playSound("reminder", true);
              notify("Reminder sound preview played.");
            }}
          >
            <Volume2 size={16} /> Test reminder sound
          </button>
          <p className="appearance-accessibility-note"><CircleHelp size={15} /> Due reminders can sound while the app is open. Your browser may require a page interaction before it allows audio playback.</p>
        </SettingSection>
        <SettingSection id="notification-history" title="Notification history" description="Task-completion and test notifications for your account, newest first (up to 100)." icon={<Bell size={20} />}>
          <div className="settings-notification-actions">
            <span>{notifications.filter(item => !item.read).length} unread</span>
            <button type="button" className="secondary" onClick={() => void clearNotifications()} disabled={notifications.length === 0}>Clear history</button>
          </div>
          {notificationLoading ? <p role="status">Loading notification history…</p> : notifications.length === 0
            ? <p className="settings-empty-state">No notifications yet. Use the test action to verify your in-app notification history.</p>
            : <ul className="settings-notification-list">
              {notifications.map(item => (
                <li key={item.id} className={item.read ? "" : "unread"}>
                  <div><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
                  <button type="button" className="secondary" onClick={() => void markNotificationRead(item)}>{item.read ? "Mark unread" : "Mark read"}</button>
                </li>
              ))}
            </ul>}
        </SettingSection>
        </div>
      </SettingsCategory>

      <SettingsCategory
        id="privacy-security"
        title="Privacy & Security"
        description="Manage AI conversation data and export the information associated with your account."
        icon={<ShieldCheck size={20} />}
      >
        <Card title="Your account data">
          <p className="settings-description">Your account data is isolated by your signed-in account. Exports contain your profile, preferences, tasks, schedule, notes, goals, AI conversations, study sessions, and notifications.</p>
          <div className="settings-action-row">
            <button type="button" className="secondary" onClick={() => void exportData()}><Download size={16} /> Export my data</button>
            <button type="button" className="secondary danger" onClick={() => void clearConversationHistory()}>Clear AI conversation history</button>
          </div>
          <p className="settings-hint">Passwords are never included in exports. Changing your password is available under Account &amp; Profile.</p>
        </Card>
      </SettingsCategory>

      <SettingsCategory
        id="performance-startup"
        title="Performance & Startup"
        description="Choose the first app page after sign-in and clear this app's local appearance cache."
        icon={<Gauge size={20} />}
      >
        <Card title="Startup & performance">
          <label className="settings-label" htmlFor="startup-page">Open this page after sign-in</label>
          <select id="startup-page" className="settings-select" value={startupPage} onChange={event => setStartupPage(event.target.value)}>
            {["Dashboard", "AI Assistant", "Tasks", "Calendar", "Reminders", "Notes", "Goals", "Study Mode", "Productivity", "Settings"].map(pageName => <option key={pageName}>{pageName}</option>)}
          </select>
          <p className="settings-description">The app already lazy-loads feature pages. Browsers manage hardware acceleration and network caches; this control only clears the app's local appearance cache, not your saved cloud settings or sign-in session.</p>
          <button type="button" className="secondary" onClick={() => {
            try {
              window.localStorage.removeItem("daily-ai-appearance");
              notify("Local appearance cache cleared. Your saved cloud settings are unchanged.");
            } catch {
              setError("Could not access local browser storage to clear the appearance cache.");
            }
          }}>Clear local appearance cache</button>
        </Card>
      </SettingsCategory>

      <SettingsCategory
        id="accessibility"
        title="Accessibility"
        description="Adjust readability and contrast; keyboard focus and system reduced-motion preferences are respected."
        icon={<Accessibility size={20} />}
      >
        <div className="appearance-settings">
        <SettingSection id="accessibility-controls" title="Readability & Contrast" description="Tune text size and contrast without making controls harder to reach." icon={<Accessibility size={20} />}>
          <label className="appearance-switch-row">
            <span><strong>High contrast</strong><small>Increase borders and text contrast across the app.</small></span>
            <input type="checkbox" checked={draft.highContrast} onChange={event => update("highContrast", event.target.checked)} />
          </label>
          <label className="appearance-range">
            <span><strong>Interface scale</strong><small>Scale the overall interface from 85% to 115%.</small></span>
            <input type="range" min="85" max="115" step="5" value={draft.interfaceScale} onChange={event => update("interfaceScale", Number(event.target.value))} />
            <output>{draft.interfaceScale}%</output>
          </label>
          <label className="appearance-setting-control">
            <strong>Reading size</strong><small>Adjust text size throughout the app.</small>
            <ChoiceGroup label="Reading size" value={draft.fontSize} options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]} onChange={fontSize => update("fontSize", fontSize)} />
          </label>
          <p className="appearance-accessibility-note"><CircleHelp size={15} /> Your operating system’s “Reduce motion” setting is respected automatically.</p>
        </SettingSection>
        </div>
      </SettingsCategory>

      <SettingsCategory
        id="help-about"
        title="Help & About"
        description="Find product information and support resources."
        icon={<LifeBuoy size={20} />}
      >
        <Card title="Frequently asked questions">
          <details className="settings-faq">
            <summary>Where are my settings saved?</summary>
            <p>Appearance and assistant preferences are saved to your authenticated account and synchronized when you sign in on another device.</p>
          </details>
          <details className="settings-faq">
            <summary>How does the assistant use my preferences?</summary>
            <p>Personality, response length, language, and custom instructions are included in the server-side AI prompt. AI responses require the server's AI_API_URL and AI_API_KEY configuration.</p>
          </details>
          <details className="settings-faq">
            <summary>Why can’t I send feedback?</summary>
            <p>Feedback delivery requires SMTP_HOST, SMTP_FROM, and SUPPORT_EMAIL to be configured by the app operator.</p>
          </details>
          <div className="settings-app-info">
            <strong>Daymate</strong>
            <span>Version 1.0.0 · Web application</span>
            <small>Startup behavior, cache access, desktop services, and hardware acceleration remain subject to browser permissions.</small>
          </div>
        </Card>
        <Card title="Contact support & report a bug">
          <form className="settings-form" onSubmit={event => void submitFeedback(event)}>
            <label className="settings-label" htmlFor="feedback-category">Message type</label>
            <select id="feedback-category" className="settings-select" value={feedbackCategory} onChange={event => setFeedbackCategory(event.target.value as "feedback" | "bug")}>
              <option value="feedback">Feedback</option><option value="bug">Bug report</option>
            </select>
            <label className="settings-label" htmlFor="feedback-message">Message</label>
            <textarea id="feedback-message" className="settings-select" rows={5} minLength={10} maxLength={4000} required value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Describe your feedback or the steps to reproduce a problem." />
            <button type="submit" className="primary" disabled={feedbackBusy || feedback.trim().length < 10}>
              <LifeBuoy size={16} /> {feedbackBusy ? "Sending…" : "Send to support"}
            </button>
          </form>
        </Card>
      </SettingsCategory>

      {loading && <span className="settings-loading" role="status">Loading your preferences…</span>}
      <span className="sr-only" aria-live="polite">{draft.animationEnabled ? `${draft.animationIntensity} animations enabled` : "Animations disabled"}</span>
    </section>
  );
}
