import assert from 'node:assert/strict';
import test from 'node:test';
import { Episode, FINALE } from '../site/works/forbidden-broadcast/exhibit/episode.mjs';

function advance(episode, seconds, present, onPhase = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / .025); i++) {
    const before = episode.phase;
    const outcome = episode.update(.025, present ? .8 : 0, present);
    if (episode.phase !== before) onPhase(episode.phase);
    if (outcome) return outcome;
  }
  return null;
}

test('a visitor starts one broadcast, and a fresh approach can start the next broadcast', () => {
  const episode = new Episode();
  const phases = [];
  assert.equal(advance(episode, 20, false), null);
  assert.equal(advance(episode, 20, true, phase => phases.push(phase)), 'cycle-complete');
  assert.deepEqual(phases, ['ident', 'notice', 'reveal', 'scare', 'cut', 'cooldown']);
  episode.reset(false);
  advance(episode, 20, true);
  assert.equal(episode.phase, 'normal');
  advance(episode, .45, false);
  advance(episode, .025, true);
  assert.equal(episode.phase, 'ident');
});

test('leaving the missing-person notice cancels its finale and rearms the next approach', () => {
  const episode = new Episode();
  advance(episode, FINALE.ident + .15, true);
  assert.equal(episode.phase, 'notice');
  assert.equal(advance(episode, 3, false), 'departure');
  assert.equal(episode.phase, 'leaving');
  episode.reset();
  advance(episode, .025, true);
  assert.equal(episode.phase, 'ident');
  assert.equal(episode.dossierTime, 0);
});
