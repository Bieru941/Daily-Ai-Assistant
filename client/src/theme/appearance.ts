export type ThemeMode = "system" | "light" | "dark" | "amoled";
export type AccentColor =
  | "electric-blue"
  | "purple"
  | "emerald"
  | "sunset"
  | "rose"
  | "cyan"
  | "custom";
export type InterfaceDensity = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "medium" | "large";
export type CornerStyle = "rounded" | "moderate" | "square";
export type NavigationStyle = "sidebar" | "bottom" | "top";
export type VisualStyle = "minimal" | "modern" | "glass";
export type AnimationIntensity = "off" | "subtle" | "smooth";
export type BackgroundEffect = "soft" | "plain" | "gradient" | "warm" | "mint" | "lavender";
export type DashboardLayout = "balanced" | "focus";
export type DashboardWidget = "progress" | "schedule" | "goals" | "tasks" | "reminders";

export type UiCustomization = {
  themeMode: ThemeMode;
  accent: AccentColor;
  customAccent: string;
  density: InterfaceDensity;
  fontSize: FontScale;
  cornerStyle: CornerStyle;
  navigation: NavigationStyle;
  visualStyle: VisualStyle;
  animationEnabled: boolean;
  animationIntensity: AnimationIntensity;
  backgroundAnimation: boolean;
  background: BackgroundEffect;
  dashboardLayout: DashboardLayout;
  visibleWidgets: DashboardWidget[];
  widgetOrder: DashboardWidget[];
  greeting: string;
  highContrast: boolean;
  interfaceScale: number;
};

export const DASHBOARD_WIDGETS: { id: DashboardWidget; label: string }[] = [
  { id: "progress", label: "Today's progress" },
  { id: "schedule", label: "Upcoming schedule" },
  { id: "goals", label: "Daily goals" },
  { id: "tasks", label: "Today's tasks" },
  { id: "reminders", label: "Upcoming reminders" },
];

export const DEFAULT_UI_CUSTOMIZATION: UiCustomization = {
  themeMode: "dark",
  accent: "sunset",
  customAccent: "#d87827",
  density: "comfortable",
  fontSize: "medium",
  cornerStyle: "moderate",
  navigation: "sidebar",
  visualStyle: "modern",
  animationEnabled: true,
  animationIntensity: "subtle",
  backgroundAnimation: false,
  background: "soft",
  dashboardLayout: "balanced",
  visibleWidgets: DASHBOARD_WIDGETS.map(widget => widget.id),
  widgetOrder: DASHBOARD_WIDGETS.map(widget => widget.id),
  greeting: "Your day, organized.",
  highContrast: false,
  interfaceScale: 100,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T)
    ? value as T
    : fallback;
}

export function normalizeUiCustomization(value: unknown): UiCustomization {
  if (!isRecord(value)) return DEFAULT_UI_CUSTOMIZATION;

  const legacyAccent: Record<string, AccentColor> = {
    violet: "purple",
    blue: "electric-blue",
    green: "emerald",
    amber: "sunset",
    teal: "cyan",
    orange: "sunset",
  };
  const accentValue = typeof value.accent === "string"
    ? legacyAccent[value.accent] ?? value.accent
    : undefined;
  const widgetIds = DASHBOARD_WIDGETS.map(widget => widget.id);
  const storedVisible = Array.isArray(value.visibleWidgets)
    ? value.visibleWidgets.filter((id): id is DashboardWidget =>
        typeof id === "string" && widgetIds.includes(id as DashboardWidget))
    : DEFAULT_UI_CUSTOMIZATION.visibleWidgets;
  const storedOrder = Array.isArray(value.widgetOrder)
    ? value.widgetOrder.filter((id): id is DashboardWidget =>
        typeof id === "string" && widgetIds.includes(id as DashboardWidget))
    : DEFAULT_UI_CUSTOMIZATION.widgetOrder;
  const interfaceScale = typeof value.interfaceScale === "number" &&
    Number.isFinite(value.interfaceScale)
    ? Math.max(85, Math.min(115, Math.round(value.interfaceScale / 5) * 5))
    : DEFAULT_UI_CUSTOMIZATION.interfaceScale;
  const customAccent = typeof value.customAccent === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.customAccent)
    ? value.customAccent
    : DEFAULT_UI_CUSTOMIZATION.customAccent;

  const legacyFontSize: Record<string, FontScale> = {
    "extra-small": "small",
    "extra-large": "large",
  };
  const fontSizeValue = typeof value.fontSize === "string"
    ? legacyFontSize[value.fontSize] ?? value.fontSize
    : undefined;

  return {
    themeMode: oneOf(value.themeMode ?? value.theme, ["system", "light", "dark", "amoled"], DEFAULT_UI_CUSTOMIZATION.themeMode),
    accent: oneOf(accentValue, ["electric-blue", "purple", "emerald", "sunset", "rose", "cyan", "custom"], DEFAULT_UI_CUSTOMIZATION.accent),
    customAccent,
    density: oneOf(value.density, ["compact", "comfortable", "spacious"], DEFAULT_UI_CUSTOMIZATION.density),
    fontSize: oneOf(fontSizeValue, ["small", "medium", "large"], DEFAULT_UI_CUSTOMIZATION.fontSize),
    cornerStyle: oneOf(value.cornerStyle, ["rounded", "moderate", "square"], DEFAULT_UI_CUSTOMIZATION.cornerStyle),
    navigation: oneOf(value.navigation, ["sidebar", "bottom", "top"], DEFAULT_UI_CUSTOMIZATION.navigation),
    visualStyle: oneOf(value.visualStyle, ["minimal", "modern", "glass"], DEFAULT_UI_CUSTOMIZATION.visualStyle),
    animationEnabled: typeof value.animationEnabled === "boolean"
      ? value.animationEnabled
      : DEFAULT_UI_CUSTOMIZATION.animationEnabled,
    animationIntensity: oneOf(value.animationIntensity, ["off", "subtle", "smooth"], DEFAULT_UI_CUSTOMIZATION.animationIntensity),
    backgroundAnimation: typeof value.backgroundAnimation === "boolean"
      ? value.backgroundAnimation
      : DEFAULT_UI_CUSTOMIZATION.backgroundAnimation,
    background: oneOf(value.background, ["soft", "plain", "gradient", "warm", "mint", "lavender"], DEFAULT_UI_CUSTOMIZATION.background),
    dashboardLayout: oneOf(value.dashboardLayout, ["balanced", "focus"], DEFAULT_UI_CUSTOMIZATION.dashboardLayout),
    visibleWidgets: [...new Set(storedVisible)],
    widgetOrder: [
      ...new Set(storedOrder),
      ...widgetIds.filter(id => !storedOrder.includes(id)),
    ],
    greeting: typeof value.greeting === "string" && value.greeting.trim().length <= 80
      ? value.greeting
      : DEFAULT_UI_CUSTOMIZATION.greeting,
    highContrast: typeof value.highContrast === "boolean"
      ? value.highContrast
      : DEFAULT_UI_CUSTOMIZATION.highContrast,
    interfaceScale,
  };
}

export function readSavedAppearance(): UiCustomization {
  try {
    const raw = window.localStorage.getItem("daily-ai-appearance");
    return raw ? normalizeUiCustomization(JSON.parse(raw)) : DEFAULT_UI_CUSTOMIZATION;
  } catch {
    return DEFAULT_UI_CUSTOMIZATION;
  }
}

export function saveAppearanceLocally(customization: UiCustomization): void {
  try {
    window.localStorage.setItem("daily-ai-appearance", JSON.stringify(customization));
  } catch {
    // Cloud preferences remain the source of persistence when local storage is unavailable.
  }
}

export function accentHex(customization: UiCustomization): string {
  if (customization.accent === "custom") return customization.customAccent;
  const colors: Record<Exclude<AccentColor, "custom">, string> = {
    "electric-blue": "#3976c4",
    purple: "#7357e8",
    emerald: "#248768",
    sunset: "#d87827",
    rose: "#cf5573",
    cyan: "#148a91",
  };
  return colors[customization.accent];
}

export function accentForeground(customization: UiCustomization): string {
  const hex = accentHex(customization).slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? "#20243a" : "#ffffff";
}

export function appearanceFromPreferences(theme: unknown, customization: unknown): UiCustomization {
  const normalized = normalizeUiCustomization(customization);
  return {
    ...normalized,
    themeMode: oneOf(theme, ["system", "light", "dark", "amoled"], normalized.themeMode),
  };
}
