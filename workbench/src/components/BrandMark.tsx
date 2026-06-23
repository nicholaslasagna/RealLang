interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`.trim()} data-testid="brand-mark" aria-hidden="true">
      <svg className="brand-mark__svg" viewBox="0 0 64 64" focusable="false">
        <defs>
          <linearGradient id="realforge-anvil" x1="9" x2="56" y1="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8f111c" />
            <stop offset="0.52" stopColor="#e32636" />
            <stop offset="1" stopColor="#ff9f24" />
          </linearGradient>
          <linearGradient id="realforge-flame" x1="23" x2="43" y1="10" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff0a8" />
            <stop offset="0.34" stopColor="#ff9f24" />
            <stop offset="1" stopColor="#e32636" />
          </linearGradient>
          <radialGradient id="realforge-ember" cx="50%" cy="28%" r="58%">
            <stop offset="0" stopColor="#ffb14a" stopOpacity="0.7" />
            <stop offset="1" stopColor="#e32636" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="33" cy="31" r="28" fill="url(#realforge-ember)" opacity="0.42" />
        <path
          className="brand-mark__flame"
          d="M29.5 33.4c-4.1-5.3-2.6-11.8 2.8-16.2 3.5-2.9 7.1-4.3 9.6-8.8.9 6.3-1.7 10.3-5.5 14.1 3.1-.8 5.2-2.5 6.7-5.4 2 5.3.6 11.7-5.7 16.4-1.8-3.8-4.6-5.7-7.9-.1Z"
          fill="url(#realforge-flame)"
        />
        <path
          className="brand-mark__anvil"
          d="M9.5 33.5h42.2l5.9-3.7H37.2c-3.4 0-5.5-.8-7.2-2.3h-7.8l-3 2.3H7.7l5.1 3.7Zm7.4 2.8h34.5c-4.8 2.7-9.4 6.1-13.2 10.5l-2.6 3.1H23.2l5-5.9-8.7 3.4 3.3-11.1h-5.9Z"
          fill="url(#realforge-anvil)"
        />
        <path className="brand-mark__edge" d="M16.9 36.3h34.5M22.2 27.5h7.8M23.2 49.9h12.4" />
        <path className="brand-mark__circuit" d="M31.6 31.2v-7.1l4.1-3.4m1.4 11v-5.8l3.1-2.5m-12.8 6.7v-5.2l-2.8-2.8" />
        <circle className="brand-mark__node" cx="36.2" cy="19.9" r="2.1" />
        <circle className="brand-mark__node" cx="41.3" cy="22.4" r="1.8" />
        <circle className="brand-mark__node" cx="24.1" cy="21.4" r="1.8" />
      </svg>
    </span>
  );
}
