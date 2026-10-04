import type { ReactNode } from "react";

const Icon = ({
  size,
  strokeWidth = 2,
  children,
}: {
  size: number;
  strokeWidth?: number;
  children: ReactNode;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const LogoIcon = () => (
  <Icon size={18} strokeWidth={2.2}>
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </Icon>
);

export const ExternalIcon = () => (
  <Icon size={14}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon size={20}>
    <path d="M12 15V3" />
    <path d="M7 8l5-5 5 5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon size={16} strokeWidth={2.4}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

export const ArrowLeftIcon = () => (
  <Icon size={16} strokeWidth={2.2}>
    <path d="M19 12H5" />
    <path d="M11 18l-6-6 6-6" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon size={15}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon size={15}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </Icon>
);
