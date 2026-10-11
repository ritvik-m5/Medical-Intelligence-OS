import type { DocKind } from '../engine/types';

/** Small inline SVG icon set. No icon dependency, consistent 1.6px stroke. */

interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: React.ReactNode, size = 16) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const Icon = {
  Memory: ({ size = 18 }: IconProps) =>
    svg(
      <>
        <path d="M12 3v4" />
        <circle cx="12" cy="10" r="3" />
        <path d="M12 13v8" />
        <path d="M5 21h14" />
        <path d="M6 6.5 9 8" />
        <path d="M18 6.5 15 8" />
      </>,
      size,
    ),
  Overview: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="10" width="7" height="11" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </>,
      size,
    ),
  TimeMachine: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>,
      size,
    ),
  Graph: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="9" r="2.5" />
        <circle cx="10" cy="18" r="2.5" />
        <path d="M8.2 7.2 15.6 8.3" />
        <path d="M7.2 8.3 9.4 15.6" />
        <path d="M15.9 11.3 11.6 16" />
      </>,
      size,
    ),
  Records: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </>,
      size,
    ),
  Debugger: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M12 3 4 7v6c0 4.4 3.4 7.4 8 8 4.6-.6 8-3.6 8-8V7z" />
        <path d="M12 8v5" />
        <path d="M12 16.5h.01" />
      </>,
      size,
    ),
  Measurements: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M3 18h18" />
        <path d="M4 14l4-5 3 3 4-6 5 7" />
      </>,
      size,
    ),
  Research: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
        <path d="M11 8.5v5" />
        <path d="M8.5 11h5" />
      </>,
      size,
    ),
  Ask: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
        <path d="M9 9h7" />
        <path d="M9 12.5h4" />
      </>,
      size,
    ),
  Close: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </>,
      size,
    ),
  Menu: ({ size = 18 }: IconProps) =>
    svg(
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>,
      size,
    ),
  Quote: ({ size = 14 }: IconProps) =>
    svg(
      <>
        <path d="M7 7h4v4a4 4 0 0 1-4 4" />
        <path d="M14 7h4v4a4 4 0 0 1-4 4" />
      </>,
      size,
    ),
  Warning: ({ size = 15 }: IconProps) =>
    svg(
      <>
        <path d="M12 4 2.5 20h19z" />
        <path d="M12 10v4" />
        <path d="M12 17h.01" />
      </>,
      size,
    ),
  Link: ({ size = 13 }: IconProps) =>
    svg(
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3" />
        <path d="M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
      </>,
      size,
    ),
  Play: ({ size = 13 }: IconProps) =>
    svg(<path d="M7 4l12 8-12 8z" />, size),
  Plus: ({ size = 15 }: IconProps) =>
    svg(
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>,
      size,
    ),
  Reset: ({ size = 14 }: IconProps) =>
    svg(
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </>,
      size,
    ),
  Eye: ({ size = 14 }: IconProps) =>
    svg(
      <>
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="2.6" />
      </>,
      size,
    ),
  Inference: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <circle cx="5" cy="12" r="2.2" />
        <circle cx="12" cy="6" r="2.2" />
        <circle cx="12" cy="18" r="2.2" />
        <circle cx="19" cy="12" r="2.2" />
        <path d="M6.8 10.6 10.3 7.3" />
        <path d="M6.8 13.4 10.3 16.7" />
        <path d="M13.7 7.3 17.2 10.6" />
        <path d="M13.7 16.7 17.2 13.4" />
      </>,
      size,
    ),
  Quality: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M4 20V9" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>,
      size,
    ),
  Cohort: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M15 20c0-2.6 1.5-4.6 3.6-5.4" />
      </>,
      size,
    ),
  Interop: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M10 6H6a4 4 0 0 0 0 8h4" />
        <path d="M14 18h4a4 4 0 0 0 0-8h-4" />
        <path d="M8 12h8" />
      </>,
      size,
    ),
  Build: ({ size = 16 }: IconProps) =>
    svg(
      <>
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="M6.3 6.3l2.5 2.5" />
        <path d="M15.2 15.2l2.5 2.5" />
        <path d="M17.7 6.3l-2.5 2.5" />
        <path d="M8.8 15.2l-2.5 2.5" />
      </>,
      size,
    ),
  Bookmark: ({ size = 14 }: IconProps) =>
    svg(<path d="M6 3h12v18l-6-4.5L6 21V3z" />, size),
  Trash: ({ size = 13 }: IconProps) =>
    svg(
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13h10l1-13" />
      </>,
      size,
    ),
  Check: ({ size = 13 }: IconProps) => svg(<path d="M4 12.5l5 5L20 6.5" />, size),
  Circle: ({ size = 12 }: IconProps) => svg(<circle cx="12" cy="12" r="8" />, size),
  Branch: ({ size = 13 }: IconProps) =>
    svg(
      <>
        <circle cx="7" cy="5" r="2.5" />
        <circle cx="7" cy="19" r="2.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M7 7.5v9" />
        <path d="M17 11.5c0 3-2.5 4-5 4.5" />
      </>,
      size,
    ),
  Settings: ({ size = 14 }: IconProps) =>
    svg(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.9 4.9l1.4 1.4" />
        <path d="M17.7 17.7l1.4 1.4" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M4.9 19.1l1.4-1.4" />
        <path d="M17.7 6.3l1.4-1.4" />
      </>,
      size,
    ),
};

export const DOC_KIND_GLYPH: Record<DocKind, string> = {
  lab_report: 'LAB',
  visit_note: 'NOTE',
  medication_list: 'MEDS',
  imaging_report: 'IMG',
  discharge_summary: 'DIS',
  vaccination_record: 'VAX',
  wearable_summary: 'WEAR',
  questionnaire: 'Q',
  procedure_note: 'PROC',
  allergy_record: 'ALG',
  pathology_report: 'PATH',
};
