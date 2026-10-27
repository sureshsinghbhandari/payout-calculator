/**
 * Artwork for the investor portal's home-screen icons (see app/portal/icon.tsx
 * and apple-icon.tsx): the portal's calculator mark in white on navy. The mark
 * sits well inside the safe area, so the same image works as a maskable icon.
 * Rendered by ImageResponse, which supports only inline styles.
 */
export const PORTAL_NAVY = "#1e3a8a";

export function PortalAppIcon({ size }: { size: number }) {
  const mark = Math.round(size * 0.5);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PORTAL_NAVY,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.6">
        <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
        <rect x="7" y="5.5" width="10" height="3.5" rx="0.75" />
        {[8.5, 12, 15.5].flatMap((x) =>
          [13, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="#ffffff" stroke="none" />),
        )}
      </svg>
    </div>
  );
}
