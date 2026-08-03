import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3' : 'h-10 px-4',
        variant === 'primary' ? 'bg-zinc-900 text-white hover:bg-zinc-800' : null,
        variant === 'ghost' ? 'bg-transparent text-zinc-900 hover:bg-zinc-100' : null,
        variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-500' : null,
        className,
      )}
      {...props}
    />
  )
}
