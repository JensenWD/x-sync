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
