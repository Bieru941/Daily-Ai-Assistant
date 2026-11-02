
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
    throw new Error("Set VITE_API_URL to your deployed API URL before building the mobile app.");
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  const url = `${API_URL}/api${normalizedPath}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status})`;

    throw new ApiError(message, response.status);
  }

  return data as T;
}
