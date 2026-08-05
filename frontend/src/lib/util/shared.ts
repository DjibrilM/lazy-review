import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLogTime(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');

  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);

  return `${hours}:${minutes}:${seconds}.${ms}`;
}
