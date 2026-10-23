const KEY = 'storehouse-token'

function readToken() {
  const fromQuery = new URLSearchParams(location.search).get('token')
  if (fromQuery) {
    try {
      sessionStorage.setItem(KEY, fromQuery)
    } catch {}
    const url = new URL(location.href)
    url.searchParams.delete('token')
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return fromQuery
  }
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

const token = readToken()

async function request(method, path, body) {
  const headers = { 'x-storehouse-token': token }
  const init = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(path, init)
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) {
    const err = new Error(json?.error ?? `${method} ${path} failed with ${res.status}`)
    err.status = res.status
    throw err
  }
  return json
}

export function get(path) {
  return request('GET', path)
}

export function send(method, path, body) {
  return request(method, path, body)
}
