/**
 * Best-effort keepalive so a reply keeps streaming when the user switches apps
 * (mobile browsers freeze hidden tabs, which kills the fetch stream).
 * Holds a Web Lock and loops a silent audio track — Chrome on Android does not
 * freeze tabs that are playing media. Must start from a user gesture (Send).
 */
let audio: HTMLAudioElement | undefined
let releaseLock: (() => void) | undefined
let holders = 0

function silentWavUrl() {
  const rate = 8000
  const samples = rate // 1s
  const buf = new ArrayBuffer(44 + samples)
  const v = new DataView(buf)
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, samples, true)
  new Uint8Array(buf, 44).fill(128)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export function startBackgroundKeepalive() {
  if (typeof document === 'undefined') return
  holders += 1
  if (holders > 1) return
  try {
    audio ??= Object.assign(new Audio(silentWavUrl()), {
      loop: true,
      volume: 0.01,
    })
    void audio.play().catch(() => {})
  } catch {
    /* unsupported */
  }
  try {
    void navigator.locks?.request(
      'free-chat-generating',
      () => new Promise<void>((resolve) => (releaseLock = resolve)),
    )
  } catch {
    /* unsupported */
  }
}

export function stopBackgroundKeepalive() {
  if (holders === 0) return
  holders -= 1
  if (holders > 0) return
  audio?.pause()
  releaseLock?.()
  releaseLock = undefined
}
