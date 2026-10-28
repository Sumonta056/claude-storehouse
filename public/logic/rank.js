export const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 25 },
  { name: 'Gold', min: 75 },
  { name: 'Platinum', min: 200 },
  { name: 'Diamond', min: 500 },
  { name: 'Elite', min: 1200 },
  { name: 'Epic', min: 3000 },
  { name: 'Legend', min: 7500 }
]

export function rankOf(cost) {
  const value = Number.isFinite(cost) && cost > 0 ? cost : 0
  const index = TIERS.findLastIndex((t) => value >= t.min)
  const tier = TIERS[index]
  const next = TIERS[index + 1] ?? null
  if (!next) return { index, tier, next, toNext: 0, pct: 100 }
  const pct = ((value - tier.min) / (next.min - tier.min)) * 100
  return { index, tier, next, toNext: next.min - value, pct }
}
