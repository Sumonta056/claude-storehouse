const PRICES = [
  ['claude-fable-5-1', 10, 50, 0.25],
  ['claude-mythos-5-1', 10, 50, 0.25],
  ['claude-fable-5', 10, 50, 1],
  ['claude-mythos-5', 10, 50, 1],
  ['claude-opus-5-5', 4, 20, 0.2],
  ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4-8', 5, 25, 0.5],
  ['claude-opus-4-7', 5, 25, 0.5],
  ['claude-opus-4-6', 5, 25, 0.5],
  ['claude-opus-4-5', 5, 25, 0.5],
  ['claude-opus-4', 15, 75, 1.5],
  ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4', 3, 15, 0.3],
  ['claude-3-7-sonnet', 3, 15, 0.3],
  ['claude-3-5-sonnet', 3, 15, 0.3],
  ['claude-haiku-5', 0.1, 0.5, 0.01],
  ['claude-haiku-4', 1, 5, 0.1],
  ['claude-3-5-haiku', 0.8, 4, 0.08],
  ['claude-3-haiku', 0.25, 1.25, 0.03]
].sort((a, b) => b[0].length - a[0].length)

export function priceOf(model) {
  const row = PRICES.find(([id]) => model === id || model.startsWith(`${id}-`))
  if (!row) return null
  const [, input, output, cacheRead] = row
  return { input, output, cacheRead, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2 }
}
