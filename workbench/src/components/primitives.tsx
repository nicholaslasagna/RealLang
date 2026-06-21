import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className = "" }: IconProps) {
  const safe = name.replace(/[^a-z0-9-]/g, "");
  return (
    <span
      className={`icon ${className}`.trim()}
      aria-hidden="true"
      style={{ ["--icon-url" as string]: `url('/assets/icons/${safe}.svg')` }}
    />
  );
}

interface BadgeProps {
  label: string;
  tone?: string;
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  iconName: string;
  variant?: string;
}

export function Button({ label, iconName, variant = "secondary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${className}`.trim()} type="button" {...rest}>
      <Icon name={iconName} />
      <span>{label}</span>
      {children}
    </button>
  );
}

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
}

export function SectionHeading({ eyebrow, title, description = "" }: SectionHeadingProps) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description ? <p className="page-description">{description}</p> : null}
    </header>
  );
}

interface StateNoteProps {
  icon: string;
  tone?: "info" | "warn" | "muted";
  what: string;
  why?: string;
  next?: string;
}

/** Consistent empty/loading/error note: what happened, why it matters, next safe action. */
export function StateNote({ icon, tone = "muted", what, why, next }: StateNoteProps) {
  return (
    <div className={`state-note state-note--${tone}`} role="note">
      <Icon name={icon} />
      <div>
        <b>{what}</b>
        {why ? <span className="state-note__why">{why}</span> : null}
        {next ? (
          <span className="state-note__next">
            <Icon name="arrow-right" />
            {next}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  iconName: string;
  tone?: string;
  emphasis?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function MetricCard({ title, iconName, tone = "cyan", emphasis = "", footer = "", children }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone} ${emphasis ? `metric-card--${emphasis}` : ""}`.trim()}>
      <header>
        <Icon name={iconName} />
        <span>{title}</span>
      </header>
      <div className="metric-card__content">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </article>
  );
}
