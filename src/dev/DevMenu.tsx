import { useMemo, useState } from 'react';
import { defaultState } from '../storage.ts';
import type { DayPhase, GameState, NeuraPresenceEventId, OperationalPowerLevel } from '../types.ts';
import {
  DEV_PRESETS,
  advanceDevFullDay,
  applyDevPreset,
  finalizeDevGame,
  getDevActionPreview,
  resetDevState,
  resolveDevDay,
  runDevAction,
  setDevDay,
  setDevPhase,
  setDevStat,
  skipDevPhase,
  toOperationalPowerLevel,
  type DevOperation,
  type DevOperationResult,
  type DevPresetId,
  type DevStatId,
} from './devMenuDomain.ts';

type DevTab = 'FLOW' | 'STATE' | 'SCENARIOS' | 'ACTIONS' | 'NEURA' | 'SAVE' | 'ENDING' | 'LOG';
type DevLogEntry = Pick<DevOperationResult, 'label' | 'success' | 'warnings' | 'stateDiff' | 'events' | 'error'> & { id: number; at: string };

const TABS: readonly DevTab[] = ['FLOW', 'STATE', 'SCENARIOS', 'ACTIONS', 'NEURA', 'SAVE', 'ENDING', 'LOG'];
const PHASES: readonly DayPhase[] = ['communication', 'work', 'result', 'daySummary', 'complete'];
const NEURA_EVENTS: readonly NeuraPresenceEventId[] = [
  'boot', 'draftSaved', 'sentToPawel', 'published', 'dayAdvanced', 'promiseMissed',
  'draftRejected', 'rhythmStarted', 'rhythmFinished', 'manualReaction', 'idlePulse', 'debugSetPower',
];
const STAT_LABELS: Record<DevStatId, string> = {
  performance: 'performance',
  cybart: 'cybart',
  chatPressure: 'chatPressure',
  echo: 'Echo',
  resonance: 'resonance',
};

export function DevMenu({
  gameState,
  neuraPower,
  onClose,
  onApply,
  onTriggerNeura,
  onSetNeuraPower,
}: {
  gameState: GameState;
  neuraPower: OperationalPowerLevel;
  onClose: () => void;
  onApply: (operation: DevOperation) => void;
  onTriggerNeura: (eventId: NeuraPresenceEventId) => void;
  onSetNeuraPower: (level: OperationalPowerLevel | null) => void;
}) {
  const [tab, setTab] = useState<DevTab>('FLOW');
  const [disableClamp, setDisableClamp] = useState(false);
  const [lockedStats, setLockedStats] = useState<Set<DevStatId>>(() => new Set());
  const [activePreset, setActivePreset] = useState<DevPresetId | null>(null);
  const [snapshot, setSnapshot] = useState<GameState | null>(null);
  const [lastResult, setLastResult] = useState<DevOperationResult | null>(null);
  const [log, setLog] = useState<DevLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [logPaused, setLogPaused] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [neuraEvent, setNeuraEvent] = useState<NeuraPresenceEventId>('manualReaction');

  const statValues: Record<DevStatId, number> = {
    performance: gameState.stats.performance,
    cybart: gameState.stats.cybart,
    chatPressure: gameState.stats.chatPressure,
    echo: gameState.echo.echoCount,
    resonance: gameState.resonance.score,
  };
  const changedFromDefault = JSON.stringify(gameState) !== JSON.stringify(defaultState);
  const filteredLog = useMemo(() => log.filter((entry) => {
    if (onlyChanges && entry.stateDiff.length === 0) return false;
    const haystack = `${entry.label} ${entry.events.join(' ')} ${entry.stateDiff.map((diff) => diff.path).join(' ')}`.toLowerCase();
    return haystack.includes(logFilter.trim().toLowerCase());
  }), [log, logFilter, onlyChanges]);

  function apply(operation: DevOperation, preset: DevPresetId | null = null) {
    onApply(operation);
    setLastResult(operation);
    if (preset !== null) setActivePreset(preset);
    else if (operation.success && !operation.label.startsWith('Preset:')) setActivePreset(null);
    if (!logPaused) {
      setLog((current) => [{
        id: Date.now() + Math.random(),
        at: new Date().toLocaleTimeString('pl-PL'),
        label: operation.label,
        success: operation.success,
        warnings: operation.warnings,
        stateDiff: operation.stateDiff,
        events: operation.events,
        error: operation.error,
      }, ...current].slice(0, 150));
    }
  }

  function applyStat(stat: DevStatId, value: number) {
    if (lockedStats.has(stat)) return;
    apply(setDevStat(gameState, stat, value, disableClamp));
  }

  function toggleLock(stat: DevStatId) {
    setLockedStats((current) => {
      const next = new Set(current);
      if (next.has(stat)) next.delete(stat);
      else next.add(stat);
      return next;
    });
  }

  function triggerNeura() {
    onTriggerNeura(neuraEvent);
    const operation: DevOperation = {
      label: `Neura: ${neuraEvent}`,
      success: true,
      warnings: [],
      stateDiff: [],
      events: [neuraEvent],
      error: null,
      nextState: gameState,
    };
    apply(operation);
  }

  function copyLog() {
    void navigator.clipboard?.writeText(filteredLog.map(formatLogEntry).join('\n'));
  }

  return (
    <aside className="dev-menu" aria-label="Dev Menu" role="dialog" aria-modal="true">
      <header className="dev-menu-header">
        <div>
          <strong>DEV MENU</strong>
          <span>DAY {gameState.dayCycle.currentDay} | PHASE {gameState.dayCycle.phase} | SAVE v{gameState.saveVersion} | ENDING {gameState.ending.route}</span>
        </div>
        <button onClick={onClose} aria-label="Zamknij Dev Menu">×</button>
      </header>
      <div className="dev-menu-flags">
        {activePreset && <span>preset: {DEV_PRESETS.find((item) => item.id === activePreset)?.label}</span>}
        {changedFromDefault && <span>stan zmodyfikowany</span>}
        {disableClamp && <span className="dev-warning">clamp wyłączony</span>}
        <span>Neura: {neuraPower}/4</span>
      </div>
      <nav className="dev-menu-tabs" aria-label="Sekcje Dev Menu">
        {TABS.map((item) => (
          <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </nav>

      <section className="dev-menu-content">
        {tab === 'FLOW' && (
          <>
            <h2>FLOW</h2>
            <div className="dev-control-row">
              <label>Dzień <input type="number" min="1" max="14" value={gameState.dayCycle.currentDay} onChange={(event) => apply(setDevDay(gameState, Number(event.target.value)))} /></label>
              <button onClick={() => apply(setDevDay(gameState, gameState.dayCycle.currentDay - 1))}>← dzień</button>
              <button onClick={() => apply(setDevDay(gameState, gameState.dayCycle.currentDay + 1))}>dzień →</button>
            </div>
            <div className="dev-button-grid">
              {PHASES.map((phase) => <button key={phase} onClick={() => apply(setDevPhase(gameState, phase))}>{phase}</button>)}
            </div>
            <div className="dev-button-grid">
              <button onClick={() => apply(skipDevPhase(gameState))}>Pomiń fazę</button>
              <button onClick={() => apply(resolveDevDay(gameState))}>Rozlicz dzień</button>
              <button onClick={() => apply(advanceDevFullDay(gameState))}>Przejdź cały dzień</button>
              <button onClick={() => apply(finalizeDevGame(gameState))}>finalizeGameState</button>
            </div>
          </>
        )}

        {tab === 'STATE' && (
          <>
            <h2>STATE</h2>
            <label className="dev-toggle"><input type="checkbox" checked={disableClamp} onChange={(event) => setDisableClamp(event.target.checked)} /> disable clamp (0–100)</label>
            <div className="dev-stat-list">
              {(Object.keys(STAT_LABELS) as DevStatId[]).map((stat) => (
                <div className="dev-stat-control" key={stat} data-locked={lockedStats.has(stat)}>
                  <div><strong>{STAT_LABELS[stat]}</strong><span>{statValues[stat]}</span></div>
                  <input type="range" min={disableClamp ? -100 : 0} max={disableClamp ? 200 : 100} value={statValues[stat]} disabled={lockedStats.has(stat)} onChange={(event) => applyStat(stat, Number(event.target.value))} />
                  <div className="dev-step-buttons">
                    {[-10, -1, 1, 10].map((delta) => <button key={delta} disabled={lockedStats.has(stat)} onClick={() => applyStat(stat, statValues[stat] + delta)}>{delta > 0 ? `+${delta}` : delta}</button>)}
                    <button className={lockedStats.has(stat) ? 'active' : ''} onClick={() => toggleLock(stat)}>{lockedStats.has(stat) ? 'Odblokuj' : 'Zablokuj'}</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="dev-state-readout">
              <span>route: {gameState.ending.route}</span>
              <span>zobowiązania: {gameState.dayCycle.commitments.filter((item) => item.status === 'active').length}</span>
              <span>flagi: {gameState.dayCycle.communicationUsed ? 'communicationUsed' : 'brak aktywnych'}</span>
            </div>
          </>
        )}

        {tab === 'SCENARIOS' && (
          <>
            <h2>SCENARIOS</h2>
            <div className="dev-preset-list">
              {DEV_PRESETS.map((preset) => (
                <button key={preset.id} className={activePreset === preset.id ? 'active' : ''} onClick={() => apply(applyDevPreset(gameState, preset.id), preset.id)}>
                  <strong>{preset.label}</strong><span>{preset.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'ACTIONS' && (
          <>
            <h2>ACTIONS</h2>
            <p className="dev-muted">Akcje korzystają z funkcji cyklu dnia. Do akcji na draftach wybierany jest pierwszy dostępny draft; wysłanie zapisuje go automatycznie, jeśli go brakuje.</p>
            <div className="dev-action-list">
              {(['saveDraft', 'sendToPawel', 'discard', 'publish', 'rest'] as const).map((action) => {
                const preview = getDevActionPreview(gameState, action);
                return <div key={action}>
                  <button onClick={() => apply(runDevAction(gameState, action))}>{action}</button>
                  <span>wymaganie: {preview.blockedReason ?? (action === 'rest' || action === 'saveDraft' || action === 'sendToPawel' || action === 'discard' || action === 'publish' ? 'faza work' : '—')}</span>
                  <span>efekt: P {signed(preview.delta.performance)}, C {signed(preview.delta.cybart)}, CP {signed(preview.delta.chatPressure)}</span>
                </div>;
              })}
              <div><button onClick={() => apply(resolveDevDay(gameState))}>resolveDay</button><span>pełne rozliczenie bieżącego dnia</span></div>
            </div>
          </>
        )}

        {tab === 'NEURA' && (
          <>
            <h2>NEURA / STORY</h2>
            <div className="dev-control-row">
              <label>event <select value={neuraEvent} onChange={(event) => setNeuraEvent(event.target.value as NeuraPresenceEventId)}>{NEURA_EVENTS.map((eventId) => <option key={eventId}>{eventId}</option>)}</select></label>
              <button onClick={triggerNeura}>Wywołaj event</button>
            </div>
            <label className="dev-range-label">visualPresence / dialoguePower: {neuraPower}<input type="range" min="0" max="4" value={neuraPower} onChange={(event) => onSetNeuraPower(toOperationalPowerLevel(Number(event.target.value)))} /></label>
            <div className="dev-state-readout"><span>ostatni event: {neuraEvent}</span><span>kolejka scen: patrz log zdarzeń</span><span>tekstowy fallback: aktywny przy braku audio</span></div>
          </>
        )}

        {tab === 'SAVE' && (
          <>
            <h2>SAVE / STORAGE</h2>
            <p className="dev-muted">Snapshot jest tymczasowy i żyje wyłącznie w Dev Menu; nie trafia do normalnego save’a.</p>
            <div className="dev-button-grid">
              <button onClick={() => { setSnapshot(structuredClone(gameState)); apply({ label: 'Zapisz snapshot', success: true, warnings: [], stateDiff: [], events: ['dev.snapshot.saved'], error: null, nextState: gameState }); }}>Zapisz snapshot</button>
              <button disabled={!snapshot} onClick={() => snapshot && apply({ label: 'Wczytaj snapshot', success: true, warnings: [], stateDiff: [], events: ['dev.snapshot.loaded'], error: null, nextState: structuredClone(snapshot) })}>Wczytaj snapshot</button>
              <button onClick={() => apply(resetDevState(gameState))}>Reset stanu</button>
            </div>
          </>
        )}

        {tab === 'ENDING' && (
          <>
            <h2>ENDING</h2>
            <div className="dev-ending"><strong>zapisany: {gameState.ending.route}</strong><span>{gameState.ending.label}</span><span>echo: {gameState.echo.echoCount}; resonance: {gameState.resonance.level}; bond: {gameState.resonance.bondWithNeura}</span></div>
            <button onClick={() => apply(finalizeDevGame(gameState))}>Wymuś przeliczenie</button>
          </>
        )}

        {tab === 'LOG' && <LogControls filter={logFilter} onFilter={setLogFilter} paused={logPaused} onPause={() => setLogPaused((value) => !value)} onlyChanges={onlyChanges} onOnlyChanges={setOnlyChanges} onCopy={copyLog} onClear={() => setLog([])} />}

        {lastResult && tab !== 'LOG' && <OperationResult result={lastResult} />}
      </section>

      <footer className="dev-log-footer">
        <LogControls filter={logFilter} onFilter={setLogFilter} paused={logPaused} onPause={() => setLogPaused((value) => !value)} onlyChanges={onlyChanges} onOnlyChanges={setOnlyChanges} onCopy={copyLog} onClear={() => setLog([])} compact />
        <div className="dev-log-list" aria-live="polite">{filteredLog.slice(0, 7).map((entry) => <pre key={entry.id}>{formatLogEntry(entry)}</pre>) || <span>Brak operacji w tej sesji.</span>}</div>
      </footer>
    </aside>
  );
}

function LogControls({ filter, onFilter, paused, onPause, onlyChanges, onOnlyChanges, onCopy, onClear, compact = false }: {
  filter: string; onFilter: (value: string) => void; paused: boolean; onPause: () => void; onlyChanges: boolean; onOnlyChanges: (value: boolean) => void; onCopy: () => void; onClear: () => void; compact?: boolean;
}) {
  return <div className={compact ? 'dev-log-controls compact' : 'dev-log-controls'}>
    <input aria-label="Filtruj log" placeholder="filtruj log" value={filter} onChange={(event) => onFilter(event.target.value)} />
    <button onClick={onCopy}>Kopiuj</button><button onClick={onClear}>Wyczyść</button><button onClick={onPause}>{paused ? 'Wznów' : 'Pauza'}</button>
    <label><input type="checkbox" checked={onlyChanges} onChange={(event) => onOnlyChanges(event.target.checked)} /> tylko zmiany</label>
  </div>;
}

function OperationResult({ result }: { result: DevOperationResult }) {
  return <div className={`dev-operation-result ${result.success ? 'success' : 'error'}`}>
    <strong>{result.success ? '✓' : '×'} {result.label}</strong>
    {result.error && <span>{result.error}</span>}
    {result.warnings.map((warning) => <span key={warning}>! {warning}</span>)}
    {result.events.map((event) => <span key={event}>event: {event}</span>)}
    {result.stateDiff.slice(0, 6).map((diff) => <span key={diff.path}>{diff.path}: {formatValue(diff.before)} → {formatValue(diff.after)}</span>)}
  </div>;
}

function formatLogEntry(entry: DevLogEntry) {
  const lines = [`${entry.at} ${entry.success ? '✓' : '×'} ${entry.label}`];
  lines.push(...entry.events.map((event) => `event: ${event}`));
  lines.push(...entry.stateDiff.slice(0, 5).map((diff) => `${diff.path}: ${formatValue(diff.before)} → ${formatValue(diff.after)}`));
  if (entry.error) lines.push(`error: ${entry.error}`);
  return lines.join('\n');
}

function formatValue(value: unknown) {
  if (value === undefined) return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `[${value.length}]` : '{…}';
  return String(value);
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
