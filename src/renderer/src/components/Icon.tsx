import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'live'
  | 'tasks'
  | 'settings'
  | 'user'
  | 'play'
  | 'plus'
  | 'logout'
  | 'volume'
  | 'volumeOff'
  | 'eye'
  | 'eyeOff'
  | 'pause'
  | 'refresh'
  | 'close'
  | 'check'
  | 'alert'
  | 'chevron'
  | 'spark'
  | 'grid'
  | 'lock'
  | 'minimize'
  | 'maximize'
  | 'restore';

const paths: Record<IconName, ReactNode> = {
  live: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10.2 8.5 5 3.5-5 3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="m8 9 1.6 1.6L12.5 7.7" />
      <path d="M8 15h8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21c.8-4 3.3-6 7-6s6.2 2 7 6" />
    </>
  ),
  play: <path d="m9 6.5 8 5.5-8 5.5z" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  logout: (
    <>
      <path d="M10 5H5v14h5" />
      <path d="M14 8.5 17.5 12 14 15.5" />
      <path d="M9 12h8.5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h3l4 3V7l-4 3z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.7a7.5 7.5 0 0 1 0 10.6" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 10v4h3l4 3V7l-4 3z" />
      <path d="m16 9 5 5M21 9l-5 5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.8M6.3 7.8A16.7 16.7 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12 2.7 2.7L16.4 9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 20H3z" />
      <path d="M12 9v4.5M12 17h.01" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  spark: (
    <>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M19 3v3M17.5 4.5h3" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  restore: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M6 16.5V7a1 1 0 0 1 1-1h9.5" />
    </>
  ),
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
