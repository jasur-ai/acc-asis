import React from 'react';

interface AcasLogoProps {
  size?: 'sm' | 'md';
}

/**
 * Compact Single-Line Logo: Vintage Engraved Stack of 4 Hardcover Books + acc.asis
 */
export const AcasLogo: React.FC<AcasLogoProps> = ({ size = 'sm' }) => {
  const iconClass = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';

  return (
    <div className="inline-flex items-center gap-2 select-none shrink-0">
      <svg viewBox="0 0 120 120" fill="none" className={`${iconClass} shrink-0`}>
        <path
          d="M46 11L104 28C109 29.5 111 35 108 40L104 45L108 49C111 53 109 59 105 62L108 66C111 70 109 76 104 79L114 86C117 89 116 94 111 97L62 115C56 117 50 116 45 112L10 85C6 81 6 75 9 71L12 67L8 62C5 58 7 52 12 49L15 47L11 41C8 36 9 29 15 26L46 11Z"
          fill="#FFFFFF"
          stroke="#CBD5E1"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Book 4 (Bottom) */}
        <path d="M13 73L57 104L103 86L103 95L57 112L13 81Z" fill="#0F172A" />
        <path d="M57 104L101 87V94L57 110V104Z" fill="#F8FAFC" />
        <path d="M59 106L99 90M59 108.5L99 92.5" stroke="#334155" strokeWidth="1.4" />
        <path d="M13 71L57 102L103 85L59 56L13 71Z" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <path d="M13 71C10 74 10 79 13 82L57 112V102L13 71Z" fill="#090D16" />
        <path d="M17 76L54 102" stroke="#94A3B8" strokeWidth="1.1" strokeDasharray="2 2" />
        {/* Book 3 */}
        <path d="M15 54L58 84L99 69V79L58 95L15 64V54Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="2" />
        <path d="M18 59L56 86M18 62L56 89M60 87L96 73M60 90L96 76" stroke="#334155" strokeWidth="1.4" />
        <path d="M14 53L58 83L101 67L57 40L14 53Z" fill="#0F172A" />
        {/* Book 2 */}
        <path d="M18 39L56 64L103 49V60L56 75L18 49V39Z" fill="#0F172A" />
        <path d="M56 64L100 50V59L56 73V64Z" fill="#F8FAFC" />
        <path d="M58 67L98 53M58 70L98 56" stroke="#334155" strokeWidth="1.4" />
        <path d="M18 39C15 42 15 47 18 50L56 75V64L18 39Z" fill="#1E293B" />
        {/* Book 1 (Top) */}
        <path d="M47 16L101 32L67 48L15 28L47 16Z" fill="#0F172A" stroke="#090D16" strokeWidth="2" strokeLinejoin="round" />
        <path d="M48 19L95 33L67 45L22 28L48 19Z" fill="#1E293B" />
        <path d="M15 28C12 31 12 37 16 40L67 60V48L15 28Z" fill="#090D16" />
        <path d="M19 32L63 50" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M67 48L99 33V43L67 58V48Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.8" />
        <path d="M69 51L97 37M69 54L97 40" stroke="#334155" strokeWidth="1.4" />
      </svg>
      <span className="font-bold tracking-tight text-base text-[var(--tg-text)] leading-none">
        acc<span className="text-[#2481CC]">.</span>asis
      </span>
    </div>
  );
};
