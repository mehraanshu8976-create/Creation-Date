import React from 'react';

export const VorqenLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <svg
      viewBox="0 0 460 155"
      className={compact ? 'w-52 h-auto select-none' : 'w-72 sm:w-88 md:w-96 h-auto select-none'}
      role="img"
      aria-label="VORQEN: Ultimate Battle Arena"
    >
      <defs>
        <linearGradient id="vqGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="45%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="vqWingLeft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="vqWingRight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="vqTextFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Split Winged Shield Crest (GTA V / Free Fire / BGMI mashup silhouette) */}
      <polygon
        points="28,74 105,52 135,88 55,98"
        fill="url(#vqWingLeft)"
        stroke="#090d16"
        strokeWidth="3"
      />
      <polygon
        points="432,74 355,52 325,88 405,98"
        fill="url(#vqWingRight)"
        stroke="#090d16"
        strokeWidth="3"
      />

      {/* Central Hex Tactical Shield */}
      <polygon
        points="230,28 318,46 306,112 230,136 154,112 142,46"
        fill="#0f172a"
        stroke="url(#vqGold)"
        strokeWidth="4"
      />
      <polygon
        points="230,36 308,52 298,106 230,127 162,106 152,52"
        fill="#1e293b"
        stroke="#ef4444"
        strokeWidth="1.5"
        opacity="0.9"
      />

      {/* Apex Crown */}
      <polygon
        points="186,36 196,12 214,24 230,6 246,24 264,12 274,36"
        fill="url(#vqGold)"
        stroke="#090d16"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="230" cy="21" r="4" fill="#ef4444" stroke="#fef08a" strokeWidth="1" />
      <circle cx="204" cy="25" r="3" fill="#38bdf8" />
      <circle cx="256" cy="25" r="3" fill="#38bdf8" />

      {/* Main VORQEN Wordmark with Outer Black Stroke */}
      <text
        x="230"
        y="94"
        textAnchor="middle"
        fill="url(#vqTextFill)"
        stroke="#090d16"
        strokeWidth="9"
        paintOrder="stroke fill"
        fontSize="54"
        fontWeight="900"
        fontStyle="italic"
        letterSpacing="4"
      >
        VORQEN
      </text>

      {/* Lightning Slash Accent */}
      <polygon
        points="240,42 222,74 236,74 218,112 246,72 232,72"
        fill="#facc15"
        stroke="#090d16"
        strokeWidth="2"
        opacity="0.92"
      />

      {/* Bottom Ribbon Plaque */}
      <polygon
        points="92,112 368,112 354,140 106,140"
        fill="#090d16"
        stroke="url(#vqGold)"
        strokeWidth="2.5"
      />
      <rect x="102" y="117" width="8" height="18" fill="#16a34a" />
      <rect x="350" y="117" width="8" height="18" fill="#ef4444" />
      <text
        x="230"
        y="131"
        textAnchor="middle"
        fill="#fbbf24"
        fontSize="14.5"
        fontWeight="800"
        letterSpacing="3.5"
      >
        ULTIMATE BATTLE ARENA
      </text>
    </svg>
  );
};

export const HudIcon: React.FC<{
  kind: 'medkit' | 'shield' | 'frag' | 'ammo' | 'crate' | 'weapon';
  className?: string;
}> = ({ kind, className = 'w-5 h-5' }) => {
  if (kind === 'weapon') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          d="M3 10h14l3-2h1v4l-3 1h-4l-1 5h-3l1-5H7l-2 3H3v-6z"
          fill="#f59e0b"
          stroke="#090d16"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'medkit') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="3" y="5" width="18" height="15" rx="3" fill="#14532d" stroke="#090d16" strokeWidth="2" />
        <path d="M9 5V3h6v2" fill="none" stroke="#86efac" strokeWidth="2" />
        <path d="M12 8v9M7.5 12.5h9" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'shield') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          d="M12 2L4 5.5v6.2c0 5 3.4 9.5 8 10.8 4.6-1.3 8-5.8 8-10.8V5.5L12 2z"
          fill="#0c4a6e"
          stroke="#38bdf8"
          strokeWidth="2"
        />
        <path d="M12 5v14M7 10h10" stroke="#7dd3fc" strokeWidth="1.8" opacity="0.7" />
      </svg>
    );
  }
  if (kind === 'frag') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="14" r="7" fill="#7f1d1d" stroke="#ef4444" strokeWidth="2" />
        <rect x="10" y="3" width="4" height="4" fill="#f59e0b" />
        <circle cx="12" cy="14" r="2.2" fill="#fca5a5" />
      </svg>
    );
  }
  if (kind === 'crate') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2" fill="#1e3a8a" stroke="#ef4444" strokeWidth="2" />
        <rect x="2" y="5" width="20" height="4" rx="1" fill="#ef4444" />
        <path d="M12 9v11" stroke="#93c5fd" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" fill="#eab308" stroke="#090d16" strokeWidth="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="#eab308" stroke="#090d16" strokeWidth="1.5" />
    </svg>
  );
};
