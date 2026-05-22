import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NeuraTutorialStep } from './tutorialGuide.ts';

type NeuraTutorialGuideProps = {
  step: NeuraTutorialStep | null;
  onOpenTarget?: (step: NeuraTutorialStep) => void;
};

export function NeuraTutorialGuide({ step, onOpenTarget }: NeuraTutorialGuideProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesVersion, setVoicesVersion] = useState(0);
  const lastSpokenStepIdRef = useRef<string | null>(null);
  const canSpeak = canUseSpeechSynthesis();
  const voices = useMemo(
    () => (canSpeak ? window.speechSynthesis.getVoices() : []),
    [canSpeak, voicesVersion],
  );

  useEffect(() => {
    if (!canSpeak) return;

    const refreshVoices = () => setVoicesVersion((current) => current + 1);
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    refreshVoices();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
  }, [canSpeak]);

  const stopSpeech = useCallback(() => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [canSpeak]);

  const speakStep = useCallback(() => {
    if (!canSpeak || !step) return;

    const utterance = new SpeechSynthesisUtterance(step.speechText);
    const polishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('pl'))
      ?? voices.find((voice) => voice.lang.toLowerCase().includes('pl'));

    utterance.lang = polishVoice?.lang ?? 'pl-PL';
    utterance.voice = polishVoice ?? null;
    utterance.rate = 0.96;
    utterance.pitch = 1.05;
    utterance.volume = 0.92;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [canSpeak, step, voices]);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  useEffect(() => {
    if (!voiceEnabled || !step || lastSpokenStepIdRef.current === step.id) return;

    lastSpokenStepIdRef.current = step.id;
    speakStep();
  }, [speakStep, step, voiceEnabled]);

  if (!step) return null;

  const voiceLabel = voiceEnabled ? 'Wyłącz głos' : 'Włącz głos';

  return (
    <aside className="neura-tutorial" aria-label="Samouczek Neury" aria-live="polite">
      <div className="neura-tutorial-head">
        <strong>Neura prowadzi</strong>
        <span>Krok {step.order}/{step.total}</span>
      </div>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="neura-tutorial-actions">
        {step.targetWindow && (
          <button type="button" onClick={() => onOpenTarget?.(step)}>
            {step.actionHint ?? 'Pokaż miejsce'}
          </button>
        )}
        <button
          type="button"
          disabled={!canSpeak}
          onClick={() => {
            if (voiceEnabled) {
              stopSpeech();
            } else {
              lastSpokenStepIdRef.current = null;
            }
            setVoiceEnabled((current) => !current);
          }}
        >
          {canSpeak ? voiceLabel : 'Brak lokalnego głosu'}
        </button>
        <button type="button" disabled={!canSpeak || isSpeaking} onClick={speakStep}>
          Powtórz
        </button>
      </div>
    </aside>
  );
}

function canUseSpeechSynthesis() {
  return (
    typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined'
  );
}
