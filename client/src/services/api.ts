import { Capacitor } from "@capacitor/core";

const API_URL = (
  import.meta.env.VITE_API_URL || ""
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (Capacitor.isNativePlatform() && !API_URL) {
    throw new Error(
      "Set VITE_API_URL to your deployed API URL before building the mobile app."
    );
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  const url = API_URL
    ? `${API_URL}${normalizedPath.startsWith("/api/")
        ? normalizedPath
        : `/api${normalizedPath}`}`
    : normalizedPath.startsWith("/api/")
      ? normalizedPath
      : `/api${normalizedPath}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data?.message || data?.error || "Something went wrong.",
      response.status
    );
  }

  return data as T;
}