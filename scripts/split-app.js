import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { STAGES } from './split-map.js'

const require = createRequire(import.meta.url)
const espree = require('espree')
const eslintScope = require('eslint-scope')

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '1fe5e97'
const STATE_MODULE = 'core/state.js'

const stage = Number(process.argv[2] ?? STAGES.length)
const outDir = path.resolve(process.argv[3] ?? path.join(ROOT, 'public'))

const code = execFileSync('git', ['show', `${BASE}:public/app.js`], { cwd: ROOT, encoding: 'utf8' })
const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', range: true })
const scopes = eslintScope.analyze(ast, { ecmaVersion: 2023, sourceType: 'module' })
const top = scopes.globalScope.childScopes[0]

const moduleOf = new Map()
for (const [i, group] of STAGES.entries()) {
  if (i >= stage) break
  for (const [file, names] of Object.entries(group)) {
    for (const name of names) {
      if (moduleOf.has(name)) throw new Error(`${name} is mapped twice`)
      moduleOf.set(name, file)
    }
  }
}

const stmts = []
const external = new Map()
for (const node of ast.body) {
  if (node.type === 'ImportDeclaration') {
    for (const s of node.specifiers) external.set(s.local.name, node.source.value.replace(/^\.\//, ''))
    continue
  }
  const decl = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node
  let names = []
  if (decl.type === 'FunctionDeclaration') names = [decl.id.name]
  else if (decl.type === 'VariableDeclaration') names = decl.declarations.map((d) => d.id.name)
  const isLet = decl.type === 'VariableDeclaration' && decl.kind === 'let'
  if (names.length > 1) throw new Error(`more than one name in one statement: ${names}`)
  stmts.push({ node, decl, name: names[0], isLet, file: names[0] ? (moduleOf.get(names[0]) ?? 'app.js') : 'app.js' })
}

const known = new Set(stmts.map((s) => s.name).filter(Boolean))
for (const name of moduleOf.keys()) if (!known.has(name)) throw new Error(`${name} is not a top-level name`)

const lets = new Set(stmts.filter((s) => s.isLet).map((s) => s.name))
const stateStmt = stmts.find((s) => s.name === 'state')
const stateKeys = new Set(stateStmt.decl.declarations[0].init.properties.map((p) => p.key.name))
for (const name of lets) if (stateKeys.has(name)) throw new Error(`state already has ${name}`)
const convert = moduleOf.has('state')
if (convert) for (const s of stmts) if (s.isLet) s.file = STATE_MODULE

const shorthand = new Set()
;(function mark(node) {
  if (!node || typeof node.type !== 'string') return
  if (node.type === 'Property' && node.shorthand) shorthand.add(node.value.range[0])
  for (const key of Object.keys(node)) {
    const child = node[key]
    if (Array.isArray(child)) child.forEach(mark)
    else if (child && typeof child.type === 'string') mark(child)
  }
})(ast)

const owner = (pos) => stmts.find((s) => pos >= s.node.range[0] && pos < s.node.range[1])
const edits = new Map()
const needs = new Map()
const warnings = []

function addNeed(stmt, name) {
  if (!needs.has(stmt)) needs.set(stmt, new Set())
  needs.get(stmt).add(name)
}

;(function visit(scope) {
  for (const ref of scope.references) {
    const id = ref.identifier
    const stmt = owner(id.range[0])
    if (!stmt) continue
    const name = id.name
    if (ref.resolved?.scope === top) {
      if (convert && lets.has(name)) {
        if (stmt.name === name && stmt.isLet) continue
        const text = shorthand.has(id.range[0]) ? `${name}: state.${name}` : `state.${name}`
        if (!edits.has(stmt)) edits.set(stmt, [])
        edits.get(stmt).push({ range: id.range, text })
        addNeed(stmt, 'state')
        continue
      }
      if (name !== stmt.name) addNeed(stmt, name)
      const target = external.get(name) ?? stmts.find((s) => s.name === name)?.file
      const sameFile = target === stmt.file
      if (!sameFile && stmt.decl.type === 'VariableDeclaration' && scope === top) {
        warnings.push(`${stmt.name} reads ${name} from ${target} at load time`)
      }
    }
  }
  for (const child of scope.childScopes) visit(child)
})(top)

function textOf(stmt) {
  const end = stmt.node.range[1]
  const start = stmt.node === stmt.decl ? stmt.node.range[0] : stmt.decl.range[0]
  let out = code.slice(start, end)
  const list = (edits.get(stmt) ?? []).sort((a, b) => b.range[0] - a.range[0])
  for (const e of list) out = out.slice(0, e.range[0] - start) + e.text + out.slice(e.range[1] - start)
  return out
}

const exported = new Set()
const files = new Map()
for (const stmt of stmts) {
  if (convert && stmt.isLet) stmt.file = STATE_MODULE
  if (!files.has(stmt.file)) files.set(stmt.file, { stmts: [], imports: new Map() })
  const f = files.get(stmt.file)
  if (!(convert && stmt.isLet)) f.stmts.push(stmt)
  for (const name of needs.get(stmt) ?? []) {
    const target =
      name === 'state' && convert ? STATE_MODULE : (external.get(name) ?? stmts.find((s) => s.name === name).file)
    if (target === stmt.file) continue
    if (!f.imports.has(target)) f.imports.set(target, new Set())
    f.imports.get(target).add(name)
    exported.add(name)
  }
}

function letField(stmt) {
  const d = stmt.decl.declarations[0]
  return `${d.id.name}: ${d.init ? textOf({ ...stmt, node: d.init, decl: d.init }) : 'null'}`
}

function body(file, f) {
  const parts = []
  let stateText = null
  for (const stmt of f.stmts) {
    let text = textOf(stmt)
    if (convert && stmt === stateStmt) {
      const fields = stmts.filter((s) => s.isLet).map(letField)
      text = text.replace(/\}\s*$/, `, ${fields.join(', ')} }`)
      stateText = text
      continue
    }
    if (stmt.name && exported.has(stmt.name) && !external.has(stmt.name)) text = `export ${text}`
    parts.push(text)
  }
  if (stateText) parts.push(`export ${stateText}`)
  return parts
}

function rel(from, to) {
  const r = path.posix.relative(path.posix.dirname(from), to)
  return r.startsWith('.') ? r : `./${r}`
}

const written = []
for (const [file, f] of [...files].sort()) {
  const imports = [...f.imports]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, names]) => `import { ${[...names].sort().join(', ')} } from '${rel(file, target)}'`)
  const text = [imports.join('\n'), ...body(file, f)].filter(Boolean).join('\n\n') + '\n'
  const dest = path.join(outDir, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, text)
  written.push(dest)
}

execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'prettier'),
  ['--config', path.join(ROOT, '.prettierrc.json'), '--write', '--log-level', 'warn', ...written],
  {
    cwd: ROOT,
    stdio: 'inherit'
  }
)

for (const w of warnings) console.warn(`warning: ${w}`)
for (const dest of written) {
  const lines = fs.readFileSync(dest, 'utf8').split('\n').length - 1
  console.log(`${String(lines).padStart(5)}  ${path.relative(outDir, dest)}`)
}
