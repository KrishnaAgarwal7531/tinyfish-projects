export default function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 2.5L27.5 7v8.2c0 7.4-4.9 13.6-11.5 14.8C9.4 28.8 4.5 22.6 4.5 15.2V7L16 2.5Z"
        fill="url(#fg-shield-fill)"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 18.5c2.6-4.8 5.6-8.4 8.7-10.6.9-.6 1.9-1 3-1.2-.5 1-1.1 1.9-1.9 2.7-2.9 3-6 6.4-8 9.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="0.5 3"
        opacity="0.6"
      />
      <path
        d="M12.8 20.2l2.8-2.7 1.9.6-3.6 3.5-1.1-1.4Zm2.9-2.8 4-3.9c1-.9 1.7-.4 1.3.8l-1.7 5.1-1.9-.5-.5-1.9-1.2.4Z"
        fill="currentColor"
      />
      <defs>
        <linearGradient id="fg-shield-fill" x1="16" y1="2.5" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  );
}
