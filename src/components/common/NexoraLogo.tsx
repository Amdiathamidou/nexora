interface NexoraLogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function NexoraLogo({ className = '', showText = true, size = 'md' }: NexoraLogoProps) {
  const svgSizes = {
    sm: { width: 22, height: 22, text: 'text-base' },
    md: { width: 28, height: 28, text: 'text-lg' },
    lg: { width: 36, height: 36, text: 'text-xl' },
    xl: { width: 44, height: 44, text: 'text-2xl' },
  };

  const current = svgSizes[size] || svgSizes.md;

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width={current.width}
        height={current.height}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 drop-shadow-sm"
      >
        <rect width="32" height="32" rx="7" className="fill-slate-900 dark:fill-blue-600" />
        <path
          d="M9 22V10L16 17.5L23 10V22"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 10H23" stroke="#60A5FA" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.65" />
      </svg>
      {showText && (
        <span className={`font-display ${current.text} font-black tracking-tight text-slate-900 dark:text-white`}>
          NEXORA
        </span>
      )}
    </span>
  );
}
