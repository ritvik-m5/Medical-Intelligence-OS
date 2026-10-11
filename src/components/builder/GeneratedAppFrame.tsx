import type { ReactNode } from 'react';

interface GeneratedAppFrameProps {
  /** Shown in the window chrome, as the address of the generated app. */
  address: string;
  tabs?: string[];
  activeTab?: string;
  onTab?: (tab: string) => void;
  children: ReactNode;
  /** Rendered at the right of the title bar. */
  badge?: ReactNode;
  className?: string;
  /** Scale the frame down slightly for the gallery miniatures. */
  size?: 'full' | 'mini';
}

/**
 * The chrome around a generated product.
 *
 * The full-size frame sits in a MacBook: a bezel and camera, a macOS title
 * bar, and a deck beneath the screen. The product stays the thing you read.
 */
export function GeneratedAppFrame({
  address,
  tabs,
  activeTab,
  onTab,
  children,
  badge,
  className = '',
  size = 'full',
}: GeneratedAppFrameProps) {
  const frame = (
    <div className={`appframe appframe--${size} ${className}`.trim()}>
      <div className="appframe-bar">
        <span className="appframe-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="appframe-address">
          <span className="appframe-lock" aria-hidden="true">
            <svg viewBox="0 0 12 14" width="9" height="10">
              <path
                d="M3.2 6.2V4.4a2.8 2.8 0 0 1 5.6 0v1.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <rect x="1.6" y="6" width="8.8" height="6.4" rx="1.3" fill="currentColor" />
            </svg>
          </span>
          <span className="appframe-url">{address}</span>
        </span>
        {badge && <span className="appframe-badge">{badge}</span>}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="appframe-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === activeTab}
              className={`appframe-tab${tab === activeTab ? ' is-active' : ''}`}
              onClick={() => onTab?.(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="appframe-body">{children}</div>
    </div>
  );

  if (size !== 'full') return frame;

  return (
    <div className="macbook">
      <div className="macbook-lid">
        <span className="macbook-camera" aria-hidden="true" />
        {frame}
      </div>
      <div className="macbook-base" aria-hidden="true">
        <div className="macbook-hinge" />
        <div className="macbook-deck">
          <div className="macbook-keys">
            {Array.from({ length: 90 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="macbook-trackpad" />
        </div>
      </div>
    </div>
  );
}
