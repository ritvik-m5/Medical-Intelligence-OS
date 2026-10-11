import type { ReactNode } from 'react';
import { confidenceTone } from '../lib/format';

export function Panel({
  title,
  sub,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="panel-head">
          {title && (
            <div style={{ minWidth: 0 }}>
              <div className="panel-title">{title}</div>
              {sub && <div className="panel-sub">{sub}</div>}
            </div>
          )}
          {actions && <div className="panel-head-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'panel-body is-flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value${tone ? ` is-${tone}` : ''}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function Chip({
  children,
  tone,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: string;
  onClick?: () => void;
  title?: string;
}) {
  const className = `chip${tone ? ` is-${tone}` : ''}${onClick ? ' is-button' : ''}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {children}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function Confidence({ value, label }: { value: number; label?: string }) {
  return (
    <span className="confidence" title={`Extraction confidence ${value.toFixed(2)}`}>
      <span className="confidence-track">
        <span
          className={`confidence-fill ${confidenceTone(value)}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      {label ?? value.toFixed(2)}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bar({ fraction, tone }: { fraction: number; tone?: string }) {
  return (
    <div className="bar">
      <div
        className="bar-fill"
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          background: tone ? `var(--${tone})` : undefined,
        }}
      />
    </div>
  );
}

export function Notice({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone?: 'warn' | 'critical';
  icon?: ReactNode;
}) {
  return (
    <div className={`notice${tone ? ` is-${tone}` : ''}`}>
      {icon}
      <div>{children}</div>
    </div>
  );
}
