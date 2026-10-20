/**
 * dsh-prompt-note — Host half.
 *
 * A Session-bound "pending prompt" list. The user writes the next idea down
 * while the current turn is still running, and sends it later from the
 * composer dock. The notes are plugin-owned data, not Session log content:
 * they live in one JSON document inside the profile data directory and are
 * served to the Client half over this plugin's own fenced route.
 *
 * The route is fenced with `connection.requestRejection`, the same browser
 * trust check every other plugin route on this Host uses; the Client half
 * posts to it same-origin from the page.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

/** Route prefix owned by this plugin; nothing else answers under it. */
const ROUTE_PATH = '/prompt-note/api'
/** Upper bound for one request body (JSON envelopes only). */
const MAX_BODY_BYTES = 512 * 1024
/** Upper bound for one note's text. */
const MAX_TEXT = 20000
/** Upper bound for notes kept per Session. */
const MAX_NOTES = 200
/** On-disk schema version of the notes document. */
const STORE_VERSION = 1

/** Host services the route needs. */
export const inject = ['webServer', 'connection']

/**
 * Mount the notes route.
 * @param ctx - this plugin's Host context.
 */
export function apply(ctx) {
  const store = createStore(ctx)
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PATH,
      handler: (req, res) => void handleRequest(ctx, store, req, res),
    }),
    'dsh-prompt-note: /prompt-note/api route',
  )
}

/**
 * One request → one operation.
 * @param ctx - Host context (browser trust lives on `connection`).
 * @param store - the notes store.
 * @param req - request face.
 * @param res - response face.
 */
async function handleRequest(ctx, store, req, res) {
  let allowed = false
  try {
    allowed = ctx.connection.requestRejection(req) === undefined
  } catch {
    allowed = false
  }
  if (!allowed) {
    writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
    return
  }
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
    return
  }
  try {
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const method = pathname.startsWith(`${ROUTE_PATH}/`)
      ? pathname.slice(ROUTE_PATH.length + 1)
      : ''
    if (method === '' || method.includes('/')) {
      writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method' } })
      return
    }
    const payload = await readJsonBody(req)
    const value = await dispatch(ctx, store, method, payload)
    writeJson(res, 200, { ok: true, value })
  } catch (error) {
    if (error instanceof PromptNoteError) {
      writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
  }
}

/**
 * The operation table. Every method is Session-scoped.
 * @param ctx - Host context; `send` needs the Session controller.
 * @param store - the notes store.
 * @param method - route tail (`list`, `add`, …).
 * @param payload - parsed JSON body.
 * @returns the method's value.
 */
async function dispatch(ctx, store, method, payload) {
  const sessionId = requireString(payload, 'sessionId')
  switch (method) {
    case 'list':
      return { notes: await store.list(sessionId) }
    case 'add': {
      const text = requireText(payload)
      return { note: await store.add(sessionId, text) }
    }
    case 'update': {
      const id = requireString(payload, 'id')
      const text = requireText(payload)
      return { note: await store.update(sessionId, id, text) }
    }
    case 'remove':
      return { removed: await store.remove(sessionId, requireString(payload, 'id')) }
    case 'consume':
      return { removed: await store.remove(sessionId, requireString(payload, 'id')) }
    case 'clear':
      return { cleared: await store.clear(sessionId) }
    case 'send':
      return await sendNote(ctx, store, sessionId, requireString(payload, 'id'))
    default:
      throw new PromptNoteError('not-found', `unknown method "${method}"`, 404)
  }
}

/**
 * Admit one stored note as the Session's next prompt, then consume it.
 *
 * The prompt goes through the Session controller — the same admission path the
 * composer uses — so a running turn queues it exactly like a typed prompt, and
 * no composer draft is touched.
 *
 * @param ctx - Host context.
 * @param store - the notes store.
 * @param sessionId - the addressed Session.
 * @param id - the note to send.
 */
async function sendNote(ctx, store, sessionId, id) {
  const controller = ctx.get('sessionController')
  if (controller === undefined) {
    throw new PromptNoteError('unsupported', 'this Host has no Session controller', 501)
  }
  const note = (await store.list(sessionId)).find((candidate) => candidate.id === id)
  if (note === undefined) throw new PromptNoteError('not-found', 'note not found', 404)
  if (note.text.trim() === '') throw new PromptNoteError('bad-request', 'note text is empty')

  const resolved = await controller.resolveAgent(sessionId)
  if (resolved === null || typeof resolved !== 'object' || resolved.agent === undefined) {
    const reason = resolved !== null && typeof resolved === 'object' && resolved.error !== undefined
      ? String(resolved.error?.code ?? 'unavailable')
      : 'unavailable'
    throw new PromptNoteError('session-unavailable', `session agent is ${reason}`, 409)
  }

  await controller.prompt({
    requestId: `prompt-note-${randomUUID()}`,
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: note.text }],
  }, new AbortController().signal)

  await store.remove(sessionId, id)
  return { sent: true }
}

/** A request the plugin refuses on its own terms. */
class PromptNoteError extends Error {
  /**
   * @param code - stable machine code.
   * @param message - user-visible reason.
   * @param status - HTTP status.
   */
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

/**
 * Read and parse a bounded JSON request body.
 * @param req - request face.
 * @returns the parsed body (`{}` when empty).
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new PromptNoteError('bad-request', 'request body too large', 413)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new PromptNoteError('bad-request', 'request body is not valid JSON')
  }
}

/** Write one JSON response. */
function writeJson(res, status, body) {
  if (res.headersSent === true) {
    res.destroy?.()
    return
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** Narrow a payload field to a non-empty string. */
function requireString(payload, key) {
  const record = payload !== null && typeof payload === 'object' ? payload : null
  const value = record?.[key]
  if (typeof value !== 'string' || value === '') {
    throw new PromptNoteError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}

/** Narrow the note text of a payload. */
function requireText(payload) {
  const record = payload !== null && typeof payload === 'object' ? payload : null
  const value = record?.text
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PromptNoteError('bad-request', 'note text is empty')
  }
  if (value.length > MAX_TEXT) {
    throw new PromptNoteError('bad-request', `note text exceeds ${MAX_TEXT} characters`, 413)
  }
  return value
}

/**
 * The notes directory: the profile's own data area when the Harness runs with
 * a profile, otherwise the default `~/.dsh/profiles/<profile>`.
 * @returns absolute directory path.
 */
function dataDirectory() {
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir !== '') {
    return path.join(profileDir, 'dsh-prompt-note')
  }
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'desktop'
  return path.join(home, 'profiles', profile, 'dsh-prompt-note')
}

/**
 * Build the store: an in-memory copy of the notes document, loaded once and
 * written back atomically after every mutation. Writes are serialized so two
 * concurrent edits cannot interleave their file replacements.
 * @param ctx - Host context, used only for diagnostics logging.
 */
function createStore(ctx) {
  const directory = dataDirectory()
  const file = path.join(directory, 'notes.json')
  let cache = null
  let queue = Promise.resolve()

  const warn = (message) => {
    try {
      ctx.logger?.warn?.(`dsh-prompt-note: ${message}`)
    } catch {
      // Logging must never fail an operation.
    }
  }

  /** Read the document from disk once, tolerating a corrupt file. */
  async function load() {
    if (cache !== null) return cache
    try {
      const text = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(text)
      cache = normalizeDocument(parsed)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        cache = emptyDocument()
      } else {
        warn(`unreadable notes file, starting empty (${error instanceof Error ? error.message : String(error)})`)
        const backup = `${file}.bad-${Date.now()}`
        await fs.rename(file, backup).catch(() => {})
        cache = emptyDocument()
      }
    }
    return cache
  }

  /** Replace the on-disk document atomically. */
  async function flush(document) {
    await fs.mkdir(directory, { recursive: true })
    const temporary = `${file}.tmp-${process.pid}`
    await fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await fs.rename(temporary, file)
  }

  /**
   * Run one mutation against the loaded document, then persist it.
   * @param mutate - synchronous mutation returning the operation's value.
   */
  function transact(mutate) {
    const run = queue.then(async () => {
      const document = await load()
      const result = mutate(document)
      await flush(document)
      return result
    })
    queue = run.then(() => undefined, () => undefined)
    return run
  }

  /** Drop a Session bucket that no longer holds notes. */
  function pruneSession(document, sessionId) {
    const bucket = document.sessions[sessionId]
    if (bucket !== undefined && bucket.length === 0) delete document.sessions[sessionId]
  }

  return {
    /** @returns the Session's notes, newest last. */
    async list(sessionId) {
      const document = await load()
      const bucket = document.sessions[sessionId]
      return bucket === undefined ? [] : bucket.slice()
    },
    /** Append one note. */
    async add(sessionId, text) {
      return transact((document) => {
        const bucket = document.sessions[sessionId] ?? (document.sessions[sessionId] = [])
        if (bucket.length >= MAX_NOTES) {
          throw new PromptNoteError('bad-request', `a session keeps at most ${MAX_NOTES} notes`, 409)
        }
        const now = Date.now()
        const note = { id: randomUUID(), text, createdAt: now, updatedAt: now }
        bucket.push(note)
        return note
      })
    },
    /** Replace one note's text. */
    async update(sessionId, id, text) {
      return transact((document) => {
        const note = (document.sessions[sessionId] ?? []).find((candidate) => candidate.id === id)
        if (note === undefined) throw new PromptNoteError('not-found', 'note not found', 404)
        note.text = text
        note.updatedAt = Date.now()
        return note
      })
    },
    /** Delete one note; `false` when it was already gone. */
    async remove(sessionId, id) {
      return transact((document) => {
        const bucket = document.sessions[sessionId]
        if (bucket === undefined) return false
        const index = bucket.findIndex((candidate) => candidate.id === id)
        if (index === -1) return false
        bucket.splice(index, 1)
        pruneSession(document, sessionId)
        return true
      })
    },
    /** Delete every note of one Session. */
    async clear(sessionId) {
      return transact((document) => {
        const bucket = document.sessions[sessionId]
        const count = bucket === undefined ? 0 : bucket.length
        delete document.sessions[sessionId]
        return count
      })
    },
  }
}

/** An empty document of the current schema. */
function emptyDocument() {
  return { version: STORE_VERSION, sessions: {} }
}

/**
 * Accept only the parts of a stored document this version understands; an
 * unknown or older shape degrades to an empty document instead of throwing.
 */
function normalizeDocument(parsed) {
  const document = emptyDocument()
  if (parsed === null || typeof parsed !== 'object') return document
  if (parsed.version !== STORE_VERSION) return document
  const sessions = parsed.sessions
  if (sessions === null || typeof sessions !== 'object') return document
  for (const [sessionId, value] of Object.entries(sessions)) {
    if (!Array.isArray(value)) continue
    const notes = []
    for (const candidate of value) {
      if (candidate === null || typeof candidate !== 'object') continue
      if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') continue
      notes.push({
        id: candidate.id,
        text: candidate.text,
        createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
        updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
      })
    }
    if (notes.length > 0) document.sessions[sessionId] = notes
  }
  return document
}
