import { PropsWithChildren } from "react";

type PanelCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  className?: string;
}>;

export default function PanelCard({ title, subtitle, className = "", children }: PanelCardProps) {
  return (
    <section className={`panel-card ${className}`.trim()}>
      <header className="panel-card__header">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="panel-card__body">{children}</div>
    </section>
  );
}
