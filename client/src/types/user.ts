export type UserProfile = {
  name: string;
  email: string;
  emailVerified?: boolean;
  createdAt?: string;
};

export type NotificationPreferences = {
  inApp: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type AuthenticatedUser = UserProfile & {
  isAdmin?: boolean;
  preferences?: {
    theme?: string;
    uiCustomization?: unknown;
    startupPage?: string;
    notificationPreferences?: Partial<NotificationPreferences> | null;
  } | null;
};
