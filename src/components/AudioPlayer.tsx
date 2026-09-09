import { useEffect, useRef, useState } from 'react'
import { getAudioUrl } from '../lib/audioCache.js'

interface AudioPlayerProps {
  copyId: string
  versionId: string
  durationSeconds: number | null
  autoPlay?: boolean
}

/**
 * O <audio src> nativo não consegue enviar nosso header X-App-Token, então
 * buscamos o MP3 autenticado e usamos um Object URL como fonte. O download é
 * feito através do cache de sessão (audioCache): a mesma versão só baixa uma
 * vez; reabrir é instantâneo. Por isso este componente NÃO revoga o URL ao
 * desmontar — quem controla o ciclo de vida é o cache.
 */
export function AudioPlayer({ copyId, versionId, durationSeconds, autoPlay }: AudioPlayerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setObjectUrl(null)

    getAudioUrl(copyId, versionId)
      .then((url) => {
        if (cancelled) return
        setObjectUrl(url)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar áudio.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [copyId, versionId])

  return (
    <div className="audio-player">
      {loading && <div className="audio-player__loading">Carregando áudio…</div>}
      {error && <div className="audio-player__error">{error}</div>}
      {objectUrl && (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={objectUrl}
          autoPlay={autoPlay}
          className="audio-player__el"
        >
          O seu navegador não suporta reprodução de áudio.
        </audio>
      )}
      {typeof durationSeconds === 'number' && (
        <div className="audio-player__duration">{durationSeconds.toFixed(1)}s</div>
      )}
    </div>
  )
}
