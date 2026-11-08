import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'zerohuit:theme'

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage unavailable — fall back to system default.
  }
  return 'system'
}

export function useTheme(): [ThemePref, (theme: ThemePref) => void] {
  const [theme, setThemeState] = useState<ThemePref>(readStored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore persistence failures (private browsing, quota, etc.)
    }
  }, [theme])

  const setTheme = useCallback((next: ThemePref) => setThemeState(next), [])

  return [theme, setTheme]
}
