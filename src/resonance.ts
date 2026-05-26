// src/resonance.ts - Neura Resonance System
// Tworzy dynamiczne połączenie między graczem a Neurą na podstawie rytmu i echo

import type { RhythmSummary, ResonanceState, NeuraResonanceEffect, NeuraPresenceState } from './types';

export const calculateResonance = (summary: RhythmSummary, currentEchoCount: number): number => {
  const base = summary.accuracy * 0.8 + (summary.perfectHits / summary.totalNotes) * 20;
  const echoBonus = Math.min(currentEchoCount * 8, 40);
  return Math.min(Math.max(Math.floor(base + echoBonus), 0), 100);
};

export const applyResonanceEffects = (resonance: number): NeuraResonanceEffect => {
  return {
    multiplier: 1 + (resonance / 200), // bonus do combo
    visualBloom: resonance > 70,
    voiceIntensity: Math.floor(resonance / 25),
    specialDialogueChance: resonance > 60 ? 0.35 : 0.1,
  };
};

export const updateResonanceState = (state: ResonanceState, newResonance: number, neuraState: NeuraPresenceState): ResonanceState => {
  const updated = { ...state };
  updated.current = newResonance;
  if (newResonance > updated.peak) updated.peak = newResonance;
  updated.bondWithNeura = Math.min(100, updated.bondWithNeura + (newResonance > 65 ? 5 : 1));
  updated.lastResonanceEvent = new Date().toISOString();
  return updated;
};

export const getResonanceOverlayClass = (resonance: number): string => {
  if (resonance > 80) return 'resonance-high';
  if (resonance > 50) return 'resonance-medium';
  return 'resonance-low';
};

// TODO: Integracja w rhythm.ts i App.tsx - wywołanie po zakończeniu rytmu
console.log('Neura Resonance System loaded - gotowe do integracji z echo i rhythm');