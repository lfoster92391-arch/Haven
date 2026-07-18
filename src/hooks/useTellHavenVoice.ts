import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useTellHavenVoice(onTranscript: (text: string, isFinal: boolean) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()))
  }, [])

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    setError(null)
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Voice isn’t available in this browser — you can still type.')
      return
    }
    stop()
    const recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = event => {
      let interim = ''
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      if (finalText) onTranscriptRef.current(finalText.trim(), true)
      else if (interim) onTranscriptRef.current(interim.trim(), false)
    }
    recognition.onerror = () => {
      setError('Something didn’t go quite as planned with voice. You can type instead.')
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Couldn’t start listening — try again, or type.')
      setListening(false)
    }
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { supported, listening, error, start, stop }
}
