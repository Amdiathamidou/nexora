interface NexoraLogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function NexoraLogo({ className = '', showText = true, size = 'md' }: NexoraLogoProps) {
  const heights = {
    sm: 'h-6',
    md: 'h-8 sm:h-9',
    lg: 'h-11 sm:h-12',
    xl: 'h-14 sm:h-16',
  };

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <img
        src="/logo-nexora.png"
        alt="NEXORA"
        className={`${heights[size]} w-auto object-contain shrink-0 drop-shadow-sm`}
        onError={(e) => {
          // Si l'image n'est pas trouvée, afficher le secours SVG
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      {showText && (
        <span className="font-display text-lg font-black tracking-tight text-slate-900 dark:text-white">
          NEXORA
        </span>
      )}
    </span>
  );
}
