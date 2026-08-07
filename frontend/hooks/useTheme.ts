"use client";

import { useEffect, useState } from 'react';

export function useThemeDetector() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkTheme = () => {
      const dark = document.documentElement.classList.contains('dark');
      setIsDark(dark);
    };
    
    checkTheme();
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  if (!mounted) return false;
  return isDark;
}

export function getThemeStyles(isDark: boolean) {
  return {
    bg: {
      primary: isDark ? 'rgb(10, 10, 10)' : 'rgb(243, 244, 246)',
      secondary: isDark ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
      tertiary: isDark ? 'rgb(55, 65, 81)' : 'rgb(249, 250, 251)',
      sidebar: isDark ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
      header: isDark ? 'rgb(55, 65, 81)' : 'rgb(249, 250, 251)',
      hover: isDark ? 'rgb(75, 85, 99)' : 'rgb(243, 244, 246)',
    },
    text: {
      primary: isDark ? 'rgb(249, 250, 251)' : 'rgb(17, 24, 39)',
      secondary: isDark ? 'rgb(209, 213, 219)' : 'rgb(107, 114, 128)',
      muted: isDark ? 'rgb(156, 163, 175)' : 'rgb(155, 155, 155)',
    },
    border: {
      default: isDark ? 'rgb(55, 65, 81)' : 'rgb(229, 231, 235)',
    },
    input: {
      bg: isDark ? 'rgb(55, 65, 81)' : 'rgb(255, 255, 255)',
      border: isDark ? 'rgb(75, 85, 99)' : 'rgb(209, 213, 219)',
      text: isDark ? 'rgb(249, 250, 251)' : 'rgb(17, 24, 39)',
    },
    button: {
      primary: isDark ? 'rgb(59, 130, 246)' : 'rgb(37, 99, 235)',
      secondary: isDark ? 'rgb(55, 65, 81)' : 'rgb(243, 244, 246)',
    },
  };
}
