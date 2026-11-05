import { createSignal } from 'solid-js'

type RecognitionResultLike = { isFinal: boolean; 0: { transcript: string } }
type RecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<RecognitionResultLike>
      }) => void)
    | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => RecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  const g = globalThis as Record<string, unknown>
  return (g.SpeechRecognition ??
    g.webkitSpeechRecognition ??
    null) as RecognitionCtor | null
}

export function isDictationSupported(): boolean {
  return getRecognitionCtor() !== null
}

export function isSpeechSynthesisSupported(): boolean {
  const g = globalThis as Record<string, unknown>
  return (
    typeof g.speechSynthesis === 'object' &&
    g.speechSynthesis !== null &&
    typeof g.SpeechSynthesisUtterance === 'function'
  )
}

export function joinDictation(base: string, addition: string): string {
  const add = addition.trim()
  if (!add) return base
  if (!base || /\s$/.test(base)) return base + add
  return `${base} ${add}`
}

/** Strip markdown so text reads naturally when spoken. */
export function markdownToSpeechText(md: string): string {
  return md
    .replace(/```[\s\S]*?(```|$)/g, ' code block omitted. ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Dictation = {
  start: (baseText: string) => void
  stop: () => void
  active: () => boolean
}

/** Continuous dictation; `onText` receives base text plus final and interim speech. */
export function createDictation(
  onText: (text: string) => void,
): Dictation | null {
  const Found = getRecognitionCtor()
  if (!Found) return null
  const Ctor: RecognitionCtor = Found
  const [active, setActive] = createSignal(false)
  let rec: RecognitionLike | null = null

  function stop() {
    const r = rec
    rec = null
    setActive(false)
    if (r) {
      r.onresult = r.onend = r.onerror = null
      try {
        r.stop()
      } catch {
        // already stopped
      }
    }
  }

  function start(baseText: string) {
    if (rec) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
    let base = baseText
    r.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      if (finalText) base = joinDictation(base, finalText)
      onText(joinDictation(base, interim))
    }
    r.onend = () => stop()
    r.onerror = () => stop()
    rec = r
    try {
      r.start()
      setActive(true)
    } catch {
      stop()
    }
  }

  return { start, stop, active }
}

const [speakingId, setSpeakingId] = createSignal<string | null>(null)
export { speakingId }

export function stopSpeaking() {
  setSpeakingId(null)
  if (isSpeechSynthesisSupported()) speechSynthesis.cancel()
}

/** Speak markdown for `id`, cancelling any other message. */
export function speak(id: string, markdown: string) {
  if (!isSpeechSynthesisSupported()) return
  speechSynthesis.cancel()
  const text = markdownToSpeechText(markdown)
  if (!text) {
    setSpeakingId(null)
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  const done = () => {
    if (speakingId() === id) setSpeakingId(null)
  }
  u.onend = done
  u.onerror = done
  setSpeakingId(id)
  speechSynthesis.speak(u)
}
