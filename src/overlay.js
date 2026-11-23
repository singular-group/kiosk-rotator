'use strict';

const $ = (id) => document.getElementById(id);

const formatTime = (ms) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

for (const name of ['prev', 'pause', 'next']) {
  $(name).addEventListener('click', () => window.kiosk.command(name));
}

window.kiosk.onState((state) => {
  $('position').textContent = `${state.index + 1}/${state.count}`;
  $('title').textContent = state.title || state.url;
  $('remaining').textContent = state.paused ? `paused · ${formatTime(state.remainingMs)}` : formatTime(state.remainingMs);
  // SVG elements have no `hidden` property; the attribute has to be toggled.
  $('icon-pause').toggleAttribute('hidden', state.paused);
  $('icon-play').toggleAttribute('hidden', !state.paused);
  $('pause').title = state.paused ? 'Resume' : 'Pause';
  $('progress').style.width = `${100 * (1 - state.remainingMs / state.durationMs)}%`;
});
