import type { ReactNode } from "react";

type SkeletonProps = {
  variant?: "line" | "title" | "block" | "circle" | "button";
  className?: string;
};

export function Skeleton({ variant = "line", className = "" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton skeleton-${variant}${className ? ` ${className}` : ""}`}
    />
  );
}

export function SkeletonStatus({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`skeleton-status${className ? ` ${className}` : ""}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <Skeleton variant="circle" />
          <div className="skeleton-row-copy">
            <Skeleton variant="line" />
            <Skeleton variant="line" className="skeleton-short" />
          </div>
        </div>
      ))}
    </div>
  );
}
