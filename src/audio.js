/* MAINSPRING — Web Audio: synthesized SFX + generative music-box soundtrack.
   Zero audio assets. All sounds are procedural. */
'use strict';

const AudioSys = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null;
  let vol = { master: 0.8, sfx: 0.8, music: 0.45 };
  let musicOn = true, musTimer = null, musStep = 0, musIdx = 4, nextNote = 0;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.connect(master);
      applyVol();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      startMusic();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function applyVol() {
    if (!ctx) return;
    master.gain.value = vol.master;
    sfxBus.gain.value = vol.sfx;
    musBus.gain.value = musicOn ? vol.music : 0;
  }
  function setVol(k, v) { vol[k] = v; applyVol(); }
  function setMusic(on) { musicOn = on; applyVol(); }

  /* one enveloped oscillator */
  function tone(freq, t0, dur, type, gain, dest, freqEnd) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, gain, freq, q, dest) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const recipes = {
    click: t => tone(660, t, 0.04, 'square', 0.10),
    hover: t => tone(880, t, 0.02, 'sine', 0.03),
    place: t => { tone(170, t, 0.10, 'sine', 0.30, sfxBus, 85); noise(t, 0.05, 0.12, 900, 2); },
    pick:  t => tone(240, t, 0.06, 'sine', 0.16, sfxBus, 330),
    tick:  (t, i) => { tone(i % 2 ? 950 : 780, t, 0.03, 'sine', 0.10); noise(t, 0.02, 0.05, 4000, 3); },
    coin:  t => { tone(880, t, 0.07, 'triangle', 0.16); tone(1318, t + 0.06, 0.10, 'triangle', 0.14); },
    buy:   t => { tone(660, t, 0.05, 'triangle', 0.14); tone(990, t + 0.05, 0.08, 'triangle', 0.14); },
    sell:  t => { tone(520, t, 0.06, 'triangle', 0.13); tone(390, t + 0.05, 0.08, 'triangle', 0.11); },
    jam:   t => { tone(110, t, 0.38, 'sawtooth', 0.22, sfxBus, 55); tone(113, t, 0.38, 'sawtooth', 0.16, sfxBus, 57); noise(t, 0.3, 0.14, 300, 1); },
    denied: t => tone(140, t, 0.09, 'square', 0.14),
    energy: t => tone(1170, t, 0.05, 'sine', 0.05),
    win:   t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, 'triangle', 0.16)),
    lose:  t => [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.16, 0.30, 'sine', 0.15)),
    boss:  t => { tone(98, t, 0.5, 'sawtooth', 0.10, sfxBus, 96); tone(196, t + 0.1, 0.4, 'triangle', 0.10); },
    whoosh: t => noise(t, 0.25, 0.10, 600, 0.8),
  };
  function sfx(name, arg) {
    if (!ensure()) return;
    const r = recipes[name];
    if (r) r(ctx.currentTime, arg || 0);
  }

  /* --- generative music box: seeded pentatonic walk, C major pentatonic --- */
  const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0];
  let musRand = (() => { let a = 20260702; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  function pluck(freq, t0, gain) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 2; /* music-box partial */
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    o.connect(g); o2.connect(g); g.connect(musBus);
    const g2 = ctx.createGain(); g2.gain.value = 0.35; o2.disconnect(); o2.connect(g2); g2.connect(g);
    o.start(t0); o.stop(t0 + 1.2); o2.start(t0); o2.stop(t0 + 1.2);
  }
  function schedule() {
    if (!ctx) return;
    const STEP = 0.30; /* seconds per 8th */
    while (nextNote < ctx.currentTime + 0.6) {
      if (nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.05;
      const t = nextNote;
      /* soft tick-tock underneath, every 2nd step */
      if (musStep % 2 === 0) noise(t, 0.015, 0.018, musStep % 4 === 0 ? 2600 : 2100, 4, musBus);
      /* low root every 8 steps */
      if (musStep % 8 === 0) pluck(130.8, t, 0.05);
      /* melodic walk */
      if (musRand() < 0.62) {
        musIdx = Math.max(0, Math.min(SCALE.length - 1, musIdx + [ -2, -1, -1, 0, 1, 1, 2 ][Math.floor(musRand() * 7)]));
        pluck(SCALE[musIdx], t, 0.075);
        if (musRand() < 0.14) pluck(SCALE[Math.max(0, musIdx - 3)], t + 0.02, 0.045);
      }
      musStep++; nextNote += STEP;
    }
  }
  function startMusic() {
    if (musTimer) return;
    nextNote = 0;
    musTimer = setInterval(schedule, 150);
  }

  return { ensure, sfx, setVol, setMusic, getVol: () => Object.assign({}, vol), isMusicOn: () => musicOn };
})();
