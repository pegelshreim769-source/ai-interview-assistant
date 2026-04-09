type BrandLogoProps = {
  className?: string;
  title?: string;
};

export function BrandLogo({ className, title }: BrandLogoProps) {
  const accessibleProps = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const };

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...accessibleProps}>
      <path
        d="M23 10h18c8.837 0 16 7.163 16 16v7c0 8.837-7.163 16-16 16H29.75L19 58v-9.92C12.74 46.244 8 40.668 8 34V26c0-8.837 7.163-16 16-16Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="22" y="29" width="6.5" height="11" rx="3.25" fill="currentColor" opacity="0.46" />
      <rect x="31.25" y="24.5" width="6.5" height="15.5" rx="3.25" fill="currentColor" opacity="0.72" />
      <rect x="40.5" y="20" width="6.5" height="20" rx="3.25" fill="currentColor" />
      <path d="M22 18.5h23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.16" />
    </svg>
  );
}
