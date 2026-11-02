
import type { CSSProperties } from "react";
import {
  accentForeground,
  accentHex,
  DEFAULT_UI_CUSTOMIZATION,
  type UiCustomization,
} from "@/theme/appearance";
import daymateLogo from "@/assets/images/Daymate-logo.png";
import "./LoadingScreen.css";

type LoadingScreenProps = {
  message?: string;
  error?: string;
  onRetry?: () => void;
  appearance?: UiCustomization;
  dark?: boolean;
};

export default function LoadingScreen({
  message = "Preparing your workspace...",
  error,
  onRetry,
  appearance = DEFAULT_UI_CUSTOMIZATION,
  dark = appearance.themeMode !== "light",
}: LoadingScreenProps) {
  const motionDisabled = !appearance.animationEnabled ||
    appearance.animationIntensity === "off";
  const style = {
    "--loading-accent": accentHex(appearance),
    "--loading-accent-foreground": accentForeground(appearance),
  } as CSSProperties;

  return (
    <main
      className={[
        "daily-loading",
        dark ? "daily-loading--dark" : "daily-loading--light",
        appearance.backgroundAnimation ? "daily-loading--effects" : "",
        appearance.animationIntensity === "smooth" ? "daily-loading--motion-smooth" : "",
        motionDisabled ? "daily-loading--motion-off" : "",
        error ? "daily-loading--error" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      aria-label={error ? "Daymate could not finish loading" : "Daymate is loading"}
      aria-busy={!error}
    >
      <div className="daily-loading__ambient daily-loading__ambient--one" aria-hidden="true" />
      <div className="daily-loading__ambient daily-loading__ambient--two" aria-hidden="true" />
      <div className="daily-loading__grain" aria-hidden="true" />

      <section className="daily-loading__content">
        <div className="daily-loading__brand">
          <div className="daily-loading__logo">
            <img src={daymateLogo} alt="" />
          </div>

          <h1 className="daily-loading__title">
            Daymate
          </h1>
        </div>

        <p className="daily-loading__tagline">
          Your day, made smarter.
        </p>

        {error ? (
          <div className="daily-loading__failure" role="alert">
            <span className="daily-loading__failure-icon" aria-hidden="true">!</span>
            <h2>We couldn’t finish loading</h2>
            <p>{error}</p>
            {onRetry && (
              <button className="daily-loading__retry" type="button" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="daily-loading__visual" aria-hidden="true">
              <div className="daily-loading__orbit daily-loading__orbit--outer" />
              <div className="daily-loading__orbit daily-loading__orbit--inner" />
              <div className="daily-loading__core">
                <svg viewBox="0 0 48 48" fill="none">
                  <path
                    d="M24 5L28.8 19.2L43 24L28.8 28.8L24 43L19.2 28.8L5 24L19.2 19.2L24 5Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <span className="daily-loading__spark daily-loading__spark--one" />
              <span className="daily-loading__spark daily-loading__spark--two" />
              <span className="daily-loading__spark daily-loading__spark--three" />
            </div>

            <div className="daily-loading__status" role="status" aria-live="polite">
              <span className="daily-loading__message">{message}</span>
              <span className="daily-loading__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>

            <div
              className="daily-loading__progress"
              role="progressbar"
              aria-label="Loading Daymate"
              aria-valuetext="Loading"
            >
              <span />
            </div>

            <p className="daily-loading__footer">
              A little clarity for every day.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
