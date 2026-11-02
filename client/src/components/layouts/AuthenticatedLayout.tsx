import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bell,
  ChevronLeft,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Sun,
  UserRound,
  X,
} from "lucide-react";

import daymateLogo from "@/assets/images/Daymate-logo.png";
import LoadingScreen from "@/components/common/LoadingScreen";
import {
  accentForeground,
  accentHex,
  type UiCustomization,
} from "@/theme/appearance";
import type { AuthenticatedUser } from "@/types/user";
import {
  primaryMobileNavigation,
  type NavigationItem,
} from "@/navigation/routes";
import type { NavigationPage } from "@/navigation/types";

type AuthenticatedLayoutProps = {
  user: AuthenticatedUser;
  page: NavigationPage;
  visibleNavigation: readonly NavigationItem[];
  appearance: UiCustomization;
  dark: boolean;
  loggingOut: boolean;
  error: string;
  reminderSoundError: string;
  onNavigate: (page: NavigationPage, section?: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  children: ReactNode;
};

export default function AuthenticatedLayout({
  user,
  page,
  visibleNavigation,
  appearance,
  dark,
  loggingOut,
  error,
  reminderSoundError,
  onNavigate,
  onLogout,
  onToggleTheme,
  children,
}: AuthenticatedLayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    const onPopState = () => setMoreOpen(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [moreOpen]);

  function navigateTo(nextPage: NavigationPage, section?: string) {
    onNavigate(nextPage, section);
    setMoreOpen(false);
  }

  return (
    <div
      className={[
        "app",
        dark ? "dark" : "",
        `ui-theme-${appearance.themeMode}`,
        `ui-accent-${appearance.accent}`,
        `ui-density-${appearance.density}`,
        `ui-background-${appearance.background}`,
        appearance.backgroundAnimation ? "ui-background-animated" : "",
        `ui-corners-${appearance.cornerStyle}`,
        `ui-style-${appearance.visualStyle}`,
        `ui-navigation-${appearance.navigation}`,
        `ui-animations-${appearance.animationEnabled ? appearance.animationIntensity : "off"}`,
        appearance.highContrast ? "ui-high-contrast" : "",
      ].filter(Boolean).join(" ")}
      data-ui-font-size={appearance.fontSize}
      style={{
        "--ui-accent": accentHex(appearance),
        "--ui-accent-hover": `color-mix(in srgb, ${accentHex(appearance)} 85%, black)`,
        "--ui-accent-soft": dark
          ? `color-mix(in srgb, ${accentHex(appearance)} 25%, #222437)`
          : `color-mix(in srgb, ${accentHex(appearance)} 13%, white)`,
        "--ui-accent-contrast": dark ? "#f5f5f7" : "#20243a",
        "--ui-accent-foreground": accentForeground(appearance),
        "--ui-interface-scale": String(appearance.interfaceScale / 100),
      } as CSSProperties}
    >
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <div className="logo"><img src={daymateLogo} alt="" /></div>
          {!collapsed && <div><b>Daymate</b><small>AI Assistant</small></div>}
        </div>

        <button className="collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
          {collapsed ? <Menu /> : <ChevronLeft />}
        </button>

        <nav>
          {visibleNavigation.map(([label, Icon]) => (
            <button
              key={label}
              title={label}
              className={page === label ? "nav active" : "nav"}
              aria-current={page === label ? "page" : undefined}
              onClick={() => navigateTo(label)}
            >
              <Icon />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>

        <button
          className="nav logout"
          onClick={() => onLogout()}
          disabled={loggingOut}
          aria-busy={loggingOut}
          aria-label={loggingOut ? "Logging out" : "Logout"}
          title={collapsed ? (loggingOut ? "Logging out..." : "Logout") : undefined}
        >
          <LogOut /> {!collapsed && <span>{loggingOut ? "Logging out..." : "Logout"}</span>}
        </button>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {primaryMobileNavigation.map(([label, Icon]) => (
          <button
            type="button"
            key={label}
            className={`mobile-bottom-nav-item${page === label ? " active" : ""}`}
            aria-label={label === "Dashboard" ? "Home" : label}
            aria-current={page === label ? "page" : undefined}
            onClick={() => navigateTo(label)}
          >
            <Icon aria-hidden="true" />
            <span>{label === "Dashboard" ? "Home" : label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`mobile-bottom-nav-item${moreOpen || !primaryMobileNavigation.some(([label]) => label === page) ? " active" : ""}`}
          aria-label="More navigation options"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen(open => !open)}
        >
          <MoreHorizontal aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="mobile-more-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <section
            className="mobile-more-sheet"
            id="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            onKeyDown={event => {
              if (event.key !== "Tab") return;
              const focusable = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <div className="mobile-more-sheet-heading">
              <div>
                <h2 id="mobile-more-title">More</h2>
                <p>{user.name} · {user.email}</p>
              </div>
              <button type="button" className="mobile-more-close" aria-label="Close menu" autoFocus onClick={() => setMoreOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more-items">
              {visibleNavigation
                .filter(([label]) => !primaryMobileNavigation.some(([primary]) => primary === label))
                .map(([label, Icon]) => (
                  <button
                    type="button"
                    key={label}
                    className={`mobile-more-item${page === label ? " active" : ""}`}
                    aria-current={page === label ? "page" : undefined}
                    onClick={() => navigateTo(label)}
                  >
                    <Icon aria-hidden="true" /><span>{label}</span>
                  </button>
                ))}
              <button
                type="button"
                className={`mobile-more-item${page === "Settings" && window.location.hash === "#account-profile" ? " active" : ""}`}
                onClick={() => navigateTo("Settings", "account-profile")}
              >
                <UserRound aria-hidden="true" /><span>Profile</span>
              </button>
            </div>
            <button type="button" className="mobile-more-logout" onClick={() => onLogout()} disabled={loggingOut} aria-busy={loggingOut}>
              <LogOut aria-hidden="true" />{loggingOut ? "Signing out…" : "Log out"}
            </button>
          </section>
        </div>
      )}

      <main>
        <header>
          <div>
            <span className="eyebrow">{page}</span>
            <h2>{page === "Dashboard" ? `Welcome back, ${user.name} 👋` : page}</h2>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {dark ? <Sun /> : <Moon />}
            </button>
            <button className="icon-btn" aria-label="Open notification history" onClick={() => navigateTo("Settings", "notification-history")}><Bell /></button>
            <div className="avatar">{user.name?.charAt(0).toUpperCase() || "U"}</div>
          </div>
        </header>
        {error && <p className="error" role="alert">{error}</p>}
        {reminderSoundError && <p className="error" role="status">{reminderSoundError}</p>}
        {children}
      </main>
    </div>
  );
}
