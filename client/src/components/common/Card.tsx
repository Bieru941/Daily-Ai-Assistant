import type { ReactNode } from "react";

export default function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}