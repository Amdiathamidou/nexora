import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  applyBrandColor: (colorHex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  applyBrandColor: () => {},
});

// Calcule une nuance plus sombre ou plus claire pour le hover et les états actifs
function adjustColorBrightness(hex: string, percent: number) {
  let num = parseInt(hex.replace('#', ''), 16);
  if (isNaN(num)) return hex;
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('nexora_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('nexora_theme', theme);

    // Restaurer la couleur de marque sauvegardée au démarrage
    const savedBrand = window.localStorage.getItem('nexora_brand_color');
    if (savedBrand && /^#[0-9A-Fa-f]{6}$/.test(savedBrand)) {
      applyBrandColor(savedBrand);
    }
  }, [theme]);

  const applyBrandColor = (colorHex: string) => {
    if (!colorHex || typeof window === 'undefined') return;
    const cleanHex = colorHex.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) return;

    const root = document.documentElement;
    const hoverColor = adjustColorBrightness(cleanHex, -20);
    const lightColor = adjustColorBrightness(cleanHex, 180);

    root.style.setProperty('--primary-color', cleanHex);
    root.style.setProperty('--primary-color-hover', hoverColor);
    root.style.setProperty('--primary-color-light', lightColor);
    root.style.setProperty('--primary-color-ring', `${cleanHex}33`);
    window.localStorage.setItem('nexora_brand_color', cleanHex);
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return <ThemeContext.Provider value={{ theme, toggleTheme, applyBrandColor }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
