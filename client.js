/**
 * dsh-prompt-note — Client half.
 *
 * A tab type in the right sidebar: the Session-bound list of prompts the user
 * wants to send AFTER the current turn finishes. It stays out of the composer
 * on purpose — the composer queue belongs to the running turn, this list
 * belongs to the user.
 *
 * Sending is a Host operation (`send`): the Host admits the stored note through
 * the Session controller and consumes it, so a running turn queues it exactly
 * like a typed prompt and no composer draft is touched.
 */
window.__ModuleLoader__.load({
  id: '@voltarenyah/dsh-prompt-note',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NAMESPACE = 'prompt-note'
    const TAB_ID = 'prompt-note'
    const ROUTE = 'prompt-note/api/'
    const API_TIMEOUT_MS = 20000

    const DICTS = {
      en: {
        tabTitle: 'Pending prompts',
        tabDescription: 'Write the next prompt down and send it when this turn is done',
        placeholder: 'Write the prompt to send after this turn… (Ctrl+Enter adds)',
        add: 'Add',
        send: 'Send',
        sending: 'Sending…',
        edit: 'Edit',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
        empty: 'Nothing pending. Write down the idea you want to run after this turn — it stays here until you send it.',
        countOne: '1 prompt waiting',
        countMany: '{count} prompts waiting',
        refresh: 'Reload',
        failed: 'That did not work: {message}',
        addedAt: 'Added {time}',
      },
      zh: {
        tabTitle: '待发送清单',
        tabDescription: '先写下下一轮要发的 prompt，等这一轮跑完再发送',
        placeholder: '写下这一轮之后要发的内容…（Ctrl+Enter 添加）',
        add: '添加',
        send: '发送',
        sending: '发送中…',
        edit: '编辑',
        delete: '删除',
        save: '保存',
        cancel: '取消',
        empty: '还没有待发送的想法。趁现在想到什么就先写下来，它会一直留在这里，直到你点发送。',
        countOne: '1 条待发送',
        countMany: '{count} 条待发送',
        refresh: '重新加载',
        failed: '操作失败：{message}',
        addedAt: '添加于 {time}',
      },
    }

    const CSS = `
.pn-panel { display: flex; flex-direction: column; box-sizing: border-box;
  height: 100%; min-height: 0; gap: 8px; padding: 10px 12px 12px;
  font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
.pn-bar { display: flex; align-items: center; gap: 6px; flex: none; }
.pn-bar-icon { display: inline-flex; flex: none; opacity: .85; }
.pn-bar-count { color: var(--dsw-alias-label-primary); font-weight: 500; }
.pn-icon-btn { display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-left: auto; padding: 0; border: none;
  border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.pn-icon-btn:hover { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.pn-icon-btn:focus-visible, .pn-btn:focus-visible, .pn-input:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.pn-compose { display: flex; flex-direction: column; gap: 4px; flex: none;
  padding: 6px 8px 8px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.pn-compose:focus-within { border-color: var(--dsw-alias-border-l2); }
.pn-compose .pn-input { border: none; background: transparent; padding: 4px 2px; }
.pn-input { box-sizing: border-box; width: 100%; resize: vertical;
  min-height: 64px; max-height: 220px; padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; line-height: 1.5; outline: none; }
.pn-input::placeholder { color: var(--dsw-alias-state-idle-primary); }
.pn-input:focus { border-color: var(--dsw-alias-border-l2); }
.pn-compose-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pn-hint { color: var(--dsw-alias-state-idle-primary); font-size: 11px; }
.pn-btn { flex: none; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px; padding: 3px 10px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; cursor: pointer;
  white-space: nowrap; }
.pn-btn:hover { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.pn-btn:disabled { opacity: .45; cursor: default; }
.pn-btn.pn-primary { color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary); }
.pn-btn.pn-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base); }
.pn-error { flex: none; padding: 6px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary); }
.pn-list { flex: 1; min-height: 0; overflow-y: auto; display: flex;
  flex-direction: column; gap: 6px; padding-right: 2px; }
.pn-item { display: flex; flex-direction: row; align-items: flex-start; gap: 8px;
  padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.pn-item.is-editing { flex-direction: column; align-items: stretch; }
.pn-item.is-sending { opacity: .6; }
.pn-item-text { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary); max-height: 148px; overflow: hidden; }
.pn-item-actions { flex: none; display: flex; align-items: center; justify-content: flex-end;
  gap: 4px; opacity: .55; transition: opacity .12s ease; }
.pn-item:hover .pn-item-actions, .pn-item:focus-within .pn-item-actions { opacity: 1; }
.pn-empty { margin-top: 10px; padding: 12px 4px; color: var(--dsw-alias-label-secondary); }
.pn-empty-title { color: var(--dsw-alias-label-primary); font-weight: 500;
  margin-bottom: 4px; }
`

    /** Small icons, drawn inline so the bundle stays self-contained. */
    const ICON_NOTE = h('svg', {
      viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      strokeLinejoin: 'round', 'aria-hidden': true,
    },
    h('path', { d: 'M3.5 2.5h6l3 3v8h-9z' }),
    h('path', { d: 'M9.5 2.5v3h3' }),
    h('path', { d: 'M5.5 8h5M5.5 10.5h3.5' }))

    const ICON_REFRESH = h('svg', {
      viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      strokeLinejoin: 'round', 'aria-hidden': true,
    },
    h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
    h('path', { d: 'M13 2.5V5h-2.5' }))

    const ICON_SEND = h('svg', {
      viewBox: '0 0 16 16', width: 11, height: 11, fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      strokeLinejoin: 'round', 'aria-hidden': true,
    },
    h('path', { d: 'M2 8l11-5-4.5 11-2-4.5z' }))

    let translate = null
    let localeRef = null

    /**
     * Localized text with a key fallback, so a missing dictionary entry never
     * blanks a control.
     * @param key - dictionary key.
     * @param params - `{name}` interpolation values.
     */
    function t(key, params) {
      let text = key
      try {
        const value = translate === null ? key : translate(key, params)
        if (typeof value === 'string' && value !== '') text = value
      } catch {
        text = key
      }
      if (params === undefined || params === null) return text
      return text.replace(/\{(\w+)\}/g, (match, name) =>
        (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match))
    }

    /**
     * POST one operation to the Host half on the page's own base, so a
     * reverse-proxy prefix and the desktop shell both keep working.
     * @param method - operation name.
     * @param payload - JSON body.
     */
    async function callApi(method, payload) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller === null ? null : setTimeout(() => controller.abort(), API_TIMEOUT_MS)
      try {
        const response = await fetch(new URL(ROUTE + method, document.baseURI).href, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller === null ? undefined : controller.signal,
        })
        let body = null
        try {
          body = await response.json()
        } catch {
          body = null
        }
        if (body === null || body.ok !== true) {
          const message = body !== null && body.error && typeof body.error.message === 'string'
            ? body.error.message
            : `HTTP ${response.status}`
          throw new Error(message)
        }
        return body.value
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    /** Turn any thrown value into one line of text. */
    function describe(failure) {
      if (failure === null || failure === undefined) return 'unknown'
      if (typeof failure === 'string') return failure
      if (typeof failure.message === 'string' && failure.message !== '') return failure.message
      return String(failure)
    }

    /**
     * The tab body: one Session's pending prompts.
     * @param props - the slot's standard props (`sessionId` is the binding).
     */
    function PromptNotePanel(props) {
      const sessionId = props.sessionId
      const [, forceRender] = useState(0)

      const [notes, setNotes] = useState([])
      const [draft, setDraft] = useState('')
      const [editing, setEditing] = useState(null)
      const [sendingId, setSendingId] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const mountedRef = useRef(true)

      useEffect(() => {
        mountedRef.current = true
        return () => {
          mountedRef.current = false
        }
      }, [])

      // Follow the active locale without re-registering the tab type.
      useEffect(() => {
        const locale = localeRef
        if (locale === null || typeof locale.subscribe !== 'function') return undefined
        const disposable = locale.subscribe(() => forceRender((value) => value + 1))
        return () => {
          if (typeof disposable === 'function') disposable()
        }
      }, [])

      const reload = useCallback(async (quiet) => {
        if (sessionId === undefined || sessionId === null) return
        if (quiet !== true) setLoading(true)
        try {
          const value = await callApi('list', { sessionId })
          if (!mountedRef.current) return
          setNotes(value !== null && Array.isArray(value.notes) ? value.notes : [])
          setError('')
        } catch (failure) {
          if (mountedRef.current) setError(t('failed', { message: describe(failure) }))
        } finally {
          if (mountedRef.current && quiet !== true) setLoading(false)
        }
      }, [sessionId])

      useEffect(() => {
        if (sessionId === undefined || sessionId === null) {
          setLoading(false)
          return undefined
        }
        void reload()
        return undefined
      }, [reload, sessionId])

      const addNote = useCallback(async () => {
        const text = draft.trim()
        if (text === '' || sessionId === undefined || sessionId === null || busy) return
        setBusy(true)
        setError('')
        try {
          const value = await callApi('add', { sessionId, text })
          if (!mountedRef.current) return
          if (value !== null && value.note) setNotes((current) => current.concat([value.note]))
          setDraft('')
        } catch (failure) {
          if (mountedRef.current) setError(t('failed', { message: describe(failure) }))
        } finally {
          if (mountedRef.current) setBusy(false)
        }
      }, [busy, draft, sessionId])

      const saveEdit = useCallback(async () => {
        if (editing === null || sessionId === undefined || sessionId === null) return
        const text = editing.text.trim()
        if (text === '') return
        setBusy(true)
        setError('')
        try {
          const value = await callApi('update', { sessionId, id: editing.id, text })
          if (!mountedRef.current) return
          const updated = value !== null ? value.note : null
          setNotes((current) => current.map((note) =>
            (note.id === editing.id && updated !== null ? updated : note)))
          setEditing(null)
        } catch (failure) {
          if (mountedRef.current) setError(t('failed', { message: describe(failure) }))
        } finally {
          if (mountedRef.current) setBusy(false)
        }
      }, [busy, editing, sessionId])

      const removeNote = useCallback(async (note) => {
        if (sessionId === undefined || sessionId === null) return
        setError('')
        try {
          await callApi('remove', { sessionId, id: note.id })
          if (!mountedRef.current) return
          setNotes((current) => current.filter((candidate) => candidate.id !== note.id))
          if (editing !== null && editing.id === note.id) setEditing(null)
        } catch (failure) {
          if (mountedRef.current) setError(t('failed', { message: describe(failure) }))
        }
      }, [editing, sessionId])

      const sendNote = useCallback(async (note) => {
        if (sessionId === undefined || sessionId === null || sendingId !== null) return
        setSendingId(note.id)
        setError('')
        try {
          await callApi('send', { sessionId, id: note.id })
          if (!mountedRef.current) return
          setNotes((current) => current.filter((candidate) => candidate.id !== note.id))
        } catch (failure) {
          if (mountedRef.current) setError(t('failed', { message: describe(failure) }))
          void reload(true)
        } finally {
          if (mountedRef.current) setSendingId(null)
        }
      }, [reload, sendingId, sessionId])

      if (sessionId === undefined || sessionId === null) {
        return h('div', { className: 'pn-panel' },
          h('style', null, CSS),
          h('div', { className: 'pn-empty' }, t('empty')))
      }

      const count = notes.length

      const compose = h('div', { className: 'pn-compose' },
        h('textarea', {
          className: 'pn-input',
          rows: 3,
          value: draft,
          placeholder: t('placeholder'),
          spellCheck: false,
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void addNote()
            }
          },
        }),
        h('div', { className: 'pn-compose-row' },
          h('span', { className: 'pn-hint' }, 'Ctrl+Enter'),
          h('button', {
            type: 'button',
            className: 'pn-btn pn-primary',
            disabled: busy || draft.trim() === '',
            onClick: () => void addNote(),
          }, t('add'))))

      const bar = h('div', { className: 'pn-bar' },
        h('span', { className: 'pn-bar-icon' }, ICON_NOTE),
        h('span', { className: 'pn-bar-count' }, count === 1 ? t('countOne') : t('countMany', { count })),
        h('button', {
          type: 'button',
          className: 'pn-icon-btn',
          title: t('refresh'),
          onClick: () => void reload(),
        }, ICON_REFRESH))

      const list = count === 0
        ? h('div', { className: 'pn-empty' },
          loading ? '…' : h('div', null,
            h('div', { className: 'pn-empty-title' }, t('tabTitle')),
            h('div', null, t('empty'))))
        : h('div', { className: 'pn-list' }, notes.map((note) => renderNote(note)))

      return h('div', { className: 'pn-panel' },
        h('style', null, CSS),
        bar,
        compose,
        error === '' ? null : h('div', { className: 'pn-error', role: 'alert' }, error),
        list)

      /** One row: display mode, edit mode, or the in-flight send state. */
      function renderNote(note) {
        const sending = sendingId === note.id
        if (editing !== null && editing.id === note.id) {
          return h('div', { className: 'pn-item is-editing', key: note.id },
            h('textarea', {
              className: 'pn-input',
              rows: 3,
              value: editing.text,
              autoFocus: true,
              spellCheck: false,
              onChange: (event) => setEditing({ id: note.id, text: event.target.value }),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void saveEdit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditing(null)
                }
              },
            }),
            h('div', { className: 'pn-item-actions' },
              h('button', {
                type: 'button',
                className: 'pn-btn',
                onClick: () => setEditing(null),
              }, t('cancel')),
              h('button', {
                type: 'button',
                className: 'pn-btn pn-primary',
                disabled: busy || editing.text.trim() === '',
                onClick: () => void saveEdit(),
              }, t('save'))))
        }
        return h('div', { className: sending ? 'pn-item is-sending' : 'pn-item', key: note.id },
          h('div', { className: 'pn-item-text' }, note.text),
          h('div', { className: 'pn-item-actions' },
            h('button', {
              type: 'button',
              className: 'pn-btn pn-primary',
              disabled: sendingId !== null,
              title: t('send'),
              onClick: () => void sendNote(note),
            }, sending
              ? t('sending')
              : h(React.Fragment, null, ICON_SEND, ' ', t('send'))),
            h('button', {
              type: 'button',
              className: 'pn-btn',
              disabled: sending,
              title: t('edit'),
              onClick: () => setEditing({ id: note.id, text: note.text }),
            }, t('edit')),
            h('button', {
              type: 'button',
              className: 'pn-btn',
              disabled: sending,
              title: t('delete'),
              onClick: () => void removeNote(note),
            }, t('delete'))))
      }
    }

    /** The guide artwork for the right sidebar's empty state. */
    function GuideArtwork() {
      return h('svg', {
        viewBox: '0 0 64 64', width: 32, height: 32, 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 8, y: 6, width: 48, height: 52, rx: 10, fill: 'none',
        stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 2 }),
      h('path', { d: 'M18 20h20M18 30h28M18 40h14', stroke: 'var(--dsw-alias-label-secondary)',
        strokeWidth: 2.4, strokeLinecap: 'round' }),
      h('path', { d: 'M44 40l12 5-6 2.2-2.2 6z', fill: 'var(--dsw-alias-brand-primary)' }))
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        localeRef = ctx.locale
        translate = ctx.locale.bind(NAMESPACE)
        ctx.effect(() => ctx.locale.register(NAMESPACE, DICTS), 'prompt-note: dictionaries')

        // The tab type: one instance per Session, offered in the right
        // sidebar's new-tab list and in its empty-state guide.
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_ID,
          multiple: false,
          title: () => t('tabTitle'),
          guide: [{
            id: 'prompt-note',
            order: 20,
            title: () => t('tabTitle'),
            description: () => t('tabDescription'),
            icon: GuideArtwork,
          }],
        }), 'prompt-note: tab type')

        // The tab body, keyed by the type id the right sidebar dispatches.
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NAMESPACE,
        }, PromptNotePanel)), 'prompt-note: tab body')
      },
    }
  },
})
