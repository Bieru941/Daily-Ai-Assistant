import { api } from "@/services/api";
import type { UserProfile } from "@/types/user";

type AuthResponseUser = {
  id: string;
  name: string;
  email: string;
};

type AuthResponse = {
  user?: AuthResponseUser;
  message?: string;
};

function profileFromResponse(
  user: AuthResponseUser | undefined,
  errorMessage = "Authentication succeeded, but no valid user was returned.",
): UserProfile {
  if (!user?.id || !user.email) {
    throw new Error(errorMessage);
  }

  return {
    name: user.name || user.email.split("@")[0],
    email: user.email,
  };
}

export async function signIn(email: string, password: string): Promise<UserProfile> {
  const response = await api<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return profileFromResponse(response.user);
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  await api<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function verifyEmail(email: string, code: string): Promise<UserProfile> {
  const response = await api<{ user?: AuthResponseUser }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return profileFromResponse(
    response.user,
    "Email verification succeeded, but no valid user was returned.",
  );
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return api<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
): Promise<void> {
  await api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, password }),
  });
}

export async function resendVerificationCode(email: string): Promise<{ message: string }> {
  return api<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
