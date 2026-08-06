import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2',
        size === 'sm' ? 'min-h-[40px] px-3' : 'min-h-[44px] px-4',
        variant === 'primary' ? 'bg-zinc-900 text-white hover:bg-zinc-800' : null,
        variant === 'secondary' ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-200' : null,
        variant === 'ghost' ? 'bg-transparent text-zinc-900 hover:bg-zinc-100' : null,
        variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-500' : null,
        className,
      )}
      {...props}
    />
  )
}
