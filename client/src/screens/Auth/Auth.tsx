import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  requestPasswordReset,
  resendVerificationCode as requestVerificationCode,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from "@/services/authService";
import daymateLogo from "@/assets/images/Daymate-logo.png";
import type { UserProfile } from "@/types/user";

type AuthProps = {
  onLogin: (user: UserProfile) => void | Promise<void>;
  onLoadingChange?: (loading: boolean) => void;
  dark?: boolean;
};

type AuthMode = "login" | "signup" | "verify" | "forgot" | "sent" | "reset";

export default function Auth({ onLogin, onLoadingChange, dark = false }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordValue, setShowPasswordValue] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const signup = mode === "signup";
  const showPassword = mode === "login" || signup || mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (signup && (name.trim().length < 1 || name.trim().length > 80)) {
      setError("Please enter a name no longer than 80 characters.");
      return;
    }
    if (mode === "verify" && !/^\d{6}$/.test(verificationCode)) {
      setError("Enter the 6-digit verification code from your email.");
      return;
    }
    if (mode === "reset" && !/^\d{6}$/.test(verificationCode)) {
      setError("Enter the 6-digit reset code from your email.");
      return;
    }
    if (showPassword && (password.length < 8 || password.length > 128)) {
      setError("Password must be between 8 and 128 characters.");
      return;
    }
    if (mode === "reset" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const authenticating = mode === "login" || mode === "verify";
    setLoading(true);
    if (authenticating) onLoadingChange?.(true);

    try {
      if (mode === "forgot") {
        const result = await requestPasswordReset(email.trim());
        setEmail(email.trim());
        setVerificationCode("");
        setMessage(result.message);
        setMode("reset");
        return;
      }

      if (mode === "verify") {
        await onLogin(await verifyEmail(email.trim(), verificationCode));
        return;
      }

      if (mode === "reset") {
        await resetPassword(email.trim(), verificationCode, password);
        setPassword("");
        setConfirmPassword("");
        setVerificationCode("");
        setMode("login");
        setMessage("Password updated. You can now sign in.");
        return;
      }

      if (signup) {
        await signUp(name.trim(), email.trim(), password);
        setEmail(email.trim());
        setVerificationCode("");
        setMode("verify");
        setMessage("A 6-digit verification code has been sent to your email. It expires in 10 minutes.");
        return;
      }
      await onLogin(await signIn(email.trim(), password));
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : "Unable to complete your request. Please try again.";
      if (mode === "login" && errorMessage === "Please verify your email before signing in.") {
        setVerificationCode("");
        setMode("verify");
        setMessage(errorMessage);
        setError("");
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
      if (authenticating) onLoadingChange?.(false);
    }
  }

  async function resendVerificationCode() {
    if (loading) return;
    setError("");
    setMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const result = await requestVerificationCode(email.trim());
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function resendPasswordResetCode() {
    if (loading) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the reset code.");
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    if (loading) return;
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setShowPasswordValue(false);
    setCapsLockOn(false);
    if (nextMode === "signup" || nextMode === "login") setName("");
  }

  const title = signup
    ? "Create account"
    : mode === "verify"
      ? "Verify your email"
      : mode === "forgot"
        ? "Reset your password"
        : mode === "reset"
          ? "Choose a new password"
          : mode === "sent"
            ? "Check your email"
            : "Welcome back";
  const description =
    message && (mode === "sent" || mode === "login" || mode === "verify" || mode === "reset")
      ? message
      : signup
        ? "Start organizing your day."
        : mode === "verify"
          ? `Enter the 6-digit code sent to ${email}.`
          : mode === "forgot"
            ? "Enter your account email and we’ll send a reset code."
            : mode === "reset"
              ? "Enter the 6-digit code sent to your email, then choose a new password."
              : "Sign in to continue.";

  return (
    <div className={`auth${dark ? " dark" : ""}`}>
      <div className="auth-card">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <img src={daymateLogo} alt="" />
          </div>
          <div>
            <b>Daymate</b>
            <small>Your intelligent daily companion</small>
          </div>
        </div>

        <h1>{title}</h1>
        <p className="muted" role="status" aria-live="polite">{description}</p>

        {mode !== "sent" && (
          <form onSubmit={submit} noValidate aria-busy={loading}>
            {signup && (
              <label className="auth-field" htmlFor="auth-name">
                <span>Full name</span>
                <input
                  id="auth-name"
                  name="name"
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  required
                  autoComplete="name"
                  maxLength={80}
                  disabled={loading}
                />
              </label>
            )}

            <label className="auth-field" htmlFor="auth-email">
              <span>Email address</span>
              <input
                id="auth-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                onBlur={() => setEmail(value => value.trim().toLowerCase())}
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading || mode === "verify" || mode === "reset"}
              />
            </label>

            {(mode === "verify" || mode === "reset") && (
              <label className="auth-field" htmlFor="auth-code">
                <span>{mode === "reset" ? "Password reset code" : "Email verification code"}</span>
                <input
                  id="auth-code"
                  name="verificationCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(event) => {
                    setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  required
                  minLength={6}
                  maxLength={6}
                  disabled={loading}
                />
              </label>
            )}

            {showPassword && (
              <label className="auth-field" htmlFor="auth-password">
                <span>{mode === "reset" ? "New password" : "Password"}</span>
                <span className="auth-password-field">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPasswordValue ? "text" : "password"}
                    placeholder={mode === "reset" ? "At least 8 characters" : "Enter your password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
                    onBlur={() => setCapsLockOn(false)}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showPasswordValue ? "Hide password" : "Show password"}
                    aria-pressed={showPasswordValue}
                    onClick={() => setShowPasswordValue(value => !value)}
                    disabled={loading}
                  >
                    {showPasswordValue ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </span>
                {capsLockOn && <small className="auth-caps-warning" role="status">Caps Lock is on.</small>}
                {mode !== "login" && <small>Use a password between 8 and 128 characters.</small>}
              </label>
            )}

            {mode === "reset" && (
              <label className="auth-field" htmlFor="auth-confirm-password">
                <span>Confirm new password</span>
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={showPasswordValue ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </label>
            )}

            {error && (
              <p className="error" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primary"
              disabled={
                loading ||
                (mode !== "reset" && !email.trim()) ||
                (showPassword && !password) ||
                (signup && !name.trim()) ||
                (mode === "verify" && verificationCode.length !== 6) ||
                (mode === "reset" && (verificationCode.length !== 6 || !confirmPassword))
              }
            >
              {loading ? "Please wait…" : signup
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset code"
                  : mode === "verify"
                    ? "Verify email"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
            </button>
          </form>
        )}

        {mode === "login" && (
          <button type="button" className="link" onClick={() => changeMode("forgot")} disabled={loading}>
            Forgot password?
          </button>
        )}
        {mode === "verify" && (
          <button type="button" className="link" onClick={resendVerificationCode} disabled={loading}>
            Resend verification code
          </button>
        )}
        {mode === "reset" && (
          <button type="button" className="link" onClick={resendPasswordResetCode} disabled={loading}>
            Send another reset code
          </button>
        )}
        {(mode === "login" || signup) && (
          <button
            type="button"
            className="link"
            onClick={() => changeMode(signup ? "login" : "signup")}
            disabled={loading}
          >
            {signup ? "Already registered? Login" : "Create an account"}
          </button>
        )}
        {(mode === "forgot" || mode === "sent" || mode === "reset") && (
          <button type="button" className="link" onClick={() => changeMode("login")} disabled={loading}>
            Back to login
          </button>
        )}
      </div>
    </div>
  );
}
