import type { ReactNode } from 'react'

interface TableScrollProps {
  children: ReactNode
  label?: string
}

export function TableScroll({ children, label }: TableScrollProps) {
  return (
    <div className="table-scroll" role={label ? 'region' : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      {children}
    </div>
  )
}
