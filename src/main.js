/* MAINSPRING — boot */
'use strict';

/* BUILD FLAGS — build.py rewrites these lines for the demo build. */
const MS_DEMO = false;
const MS_ITCH_URL = 'https://YOURNAME.itch.io/mainspring';
/* Unlock codes (djb2 hashes) — sell codes via Stripe Payment Links or itch rewards.
   Codes and hash generator are documented in LAUNCH_KIT.md. */
const MS_UNLOCK_HASHES = [/*@HASHES@*/];

window.addEventListener('load', () => {
  UI.init({ demo: MS_DEMO, itchUrl: MS_ITCH_URL, unlockHashes: MS_UNLOCK_HASHES });
});
