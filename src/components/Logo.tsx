export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--acento)" />
      <path d="M18 12h20l10 10v30a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" fill="#fff" />
      <path d="M38 12v10h10z" fill="#f3b3b1" />
      <text x="32" y="46" fontFamily="Arial,Helvetica,sans-serif" fontWeight="700" fontSize="14" textAnchor="middle" fill="var(--acento)">
        PDF
      </text>
    </svg>
  );
}
