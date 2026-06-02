export const iconPaths = {
  sync: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" />
      <path d="M4 20v-5h5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66L11.5 7" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66L12.5 17" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-9 7-16 16-16 0 9-7 16-16 16z" />
      <path d="M4 20l8-8" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  shield: <path d="M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6z" />,
  plane: <path d="M3 12l18-7-7 18-2-8-9-3z" />,
  briefcase: (
    <>
      <rect height="13" rx="2" width="18" x="3" y="7" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  cake: (
    <>
      <path d="M4 20h16V12H4z" />
      <path d="M4 15c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1" />
      <path d="M12 3v5" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  arrowUpRight: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  play: <path d="M5 3v18l15-9z" />,
  calendar: (
    <>
      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </>
  ),
  lock: (
    <>
      <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  checkCircle: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  copy: (
    <>
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  outlook: (
    <>
      <rect height="16" rx="2" width="20" x="2" y="4" />
      <path d="M2 8h20" />
      <path d="M6 12h4" />
      <path d="M6 16h4" />
      <path d="M14 12h4" />
      <path d="M14 16h4" />
    </>
  ),
  gcal: (
    <>
      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </>
  ),
  applecal: (
    <>
      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </>
  ),
} as const;

export const MarketingIcon = ({
  id,
  size = 20,
  className,
}: {
  id: keyof typeof iconPaths;
  size?: number;
  className?: string;
}) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 24 24"
    width={size}
  >
    {iconPaths[id]}
  </svg>
);
