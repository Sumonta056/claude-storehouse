export function mcpTransport(m) {
  return m.transport === 'stdio' ? 'Local · stdio' : `Remote · ${m.transport}`
}

export function parseEnv(text) {
  const env = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!m) return { error: `"${line}" is not KEY=VALUE.` }
    env[m[1]] = m[2]
  }
  return { env }
}
