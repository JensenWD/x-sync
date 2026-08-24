import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "4m", "3h", "2d" — the compact age the redesign uses wherever a timestamp
 * sits next to a name and must not compete with it for attention.
 */
export function compactAge(epochSeconds: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86_400)}d`
}

/** "812", "4.2K", "1.3M" — engagement counts at the size the metric row gives them. */
export function compactCount(value: number) {
  if (value < 1000) return String(value)
  if (value < 1_000_000) {
    const thousands = value / 1000
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.round(thousands)}K`
  }
  const millions = value / 1_000_000
  return `${millions < 10 ? millions.toFixed(1).replace(/\.0$/, '') : Math.round(millions)}M`
}
