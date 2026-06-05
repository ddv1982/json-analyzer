export function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

export function formatPercent(value: number): string {
  return `${formatDecimal(value)}%`
}
