import { strict as assert } from 'node:assert';
import { defaultState } from '../src/storage.ts';
import {
  advanceDevFullDay,
  applyDevPreset,
  runDevAction,
  setDevPhase,
  setDevStat,
} from '../src/dev/devMenuDomain.ts';

function freshState() {
  return structuredClone(defaultState);
}

{
  const operation = setDevStat(freshState(), 'chatPressure', 140, false);
  assert.equal(operation.success, true, 'edycja statystyki powinna się udać');
  assert.equal(operation.nextState.stats.chatPressure, 100, 'zwykły clamp ogranicza wartość do 100');
}

{
  const operation = setDevStat(freshState(), 'chatPressure', 140, true);
  assert.equal(operation.nextState.stats.chatPressure, 140, 'wyłączony clamp pozostawia wartość testową poza zakresem');
  assert.ok(operation.warnings.length > 0, 'stan poza zakresem zwraca ostrzeżenie');
}

{
  const operation = advanceDevFullDay(freshState());
  assert.equal(operation.nextState.dayCycle.currentDay, 2, 'pełny przebieg dnia przechodzi do następnego dnia');
  assert.equal(operation.nextState.dayCycle.phase, 'communication', 'pełny przebieg kończy się komunikacją następnego dnia');
}

{
  const workState = setDevPhase(freshState(), 'work').nextState;
  const operation = runDevAction(workState, 'sendToPawel');
  assert.equal(operation.success, true, 'wysłanie do Pawcia powinno utworzyć stan akcji');
  assert.ok(operation.events.includes('draft.saved'), 'wysłanie automatycznie zapisuje draft');
  assert.ok(operation.events.includes('draft.sentToPawel'), 'wysłanie emituje właściwe zdarzenie');
}

{
  const operation = applyDevPreset(freshState(), 'neuraMax');
  assert.equal(operation.nextState.echo.echoCount, 6, 'preset Neura maksymalna ustawia Echo');
  assert.equal(operation.nextState.resonance.bondWithNeura, 'merged', 'preset Neura maksymalna ustawia więź');
}

console.log('dev-menu.dev-test: OK');
