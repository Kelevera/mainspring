# ⚙ MAINSPRING

> A clockwork engine-building roguelike in **one dependency-free HTML file**. Meshed gears must counter-rotate — close a tight loop and the whole train jams.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)
![Stack](https://img.shields.io/badge/stack-vanilla%20JS%20·%200%20dependencies-brightgreen)
![Tests](https://img.shields.io/badge/tests-207%20assertions%20passing-success)
![Size](https://img.shields.io/badge/entire%20game-~84%20KB-orange)

**[▶ Play the free demo in your browser](https://kelevera.github.io/mainspring/)** · **[Get the full game on itch.io](https://kelevera.itch.io/mainspring)**

---

## The hook: your synergies are physically real

Every deckbuilder promises "combos". MAINSPRING makes them mechanical. You install gears on a hex board, and power flows outward from the central Mainspring Drive — but meshed gears must counter-rotate, exactly like real gears. On a hex lattice, three mutually-adjacent gears form an odd cycle: there is *no valid rotation assignment*, so the entire connected train **jams** and produces nothing.

That one rule — literally [graph 2-coloring](https://en.wikipedia.org/wiki/Bipartite_graph) enforced by physics — generates the whole game: straight trains are safe, tight curls are death, clockwise-loving gears demand parity planning (every second gear in a chain flips direction), and the rare *Greased Bushing* acts as a parity wildcard that breaks odd cycles. The simulation is fully deterministic, so the UI shows an **exact forecast** of your machine's output before you commit. Every failure is a layout you could have fixed.

Around that core: 8 escalating contracts with boss conditions, a shop economy with 27 gears across three rarities, 8 charms, chassis expansions, endless mode, and a daily seeded challenge with shareable results.

## Zero assets, all code

The entire game is procedural:

- **Art** — brass gears drawn on canvas (radial gradients, parametric teeth, per-gear spoke counts), direction arrows, jam effects, particles.
- **Audio** — 14 sound effects synthesized with the Web Audio API, plus a generative music-box soundtrack that composes itself from a seeded pentatonic walk.
- **Content** — every gear is ~4 lines in [`src/data.js`](src/data.js): a cost, a description, and a `calc(context)` function. New content automatically appears in shops, tooltips, and the compendium.

## Architecture

| File | Role |
|---|---|
| [`src/data.js`](src/data.js) | All content: 28 gears, 8 charms, 6 boss modifiers, quotas, economy constants |
| [`src/engine.js`](src/engine.js) | Pure logic, no DOM: hex math, the spin/jam solver (BFS 2-coloring with wildcard nodes), deterministic tick simulation, shop, persistence |
| [`src/ui.js`](src/ui.js) | Canvas renderer, DOM screens, drag-and-drop input, autosave |
| [`src/audio.js`](src/audio.js) | Synthesized SFX + generative soundtrack |
| [`build.py`](build.py) | Inlines everything into a single `index.html` (full + demo builds, itch.io zips) |

The engine/UI split means the whole game logic runs headless in Node — which enables the part I'm proudest of:

## Balance as code

`tests/test_engine.js` contains 207 assertions covering the jam solver (triangles jam, 120° bends don't, wildcards rescue odd cycles, full rings lock the drive), the economy, save roundtrips, and seeded-shop determinism — plus a **greedy-bot balance simulation** that plays 80 full runs per test execution and asserts the difficulty curve sits in a target band (current: 56% bot win rate, deaths spread across contracts 3–8). Rebalancing is a data edit followed by a test run that *tells you what the change did to the curve*.

```bash
node tests/test_engine.js            # engine tests + balance simulation
npm i jsdom && node tests/smoke.js docs/index.html   # headless end-to-end UI test
python3 build.py                     # rebuild single-file full + demo + itch zips
```

## Built autonomously by Claude Fable 5

This project — concept selection and market validation, game design, the engine and its jam-solver, renderer, synthesized audio, the 207-assertion test suite, bot-driven balance tuning, and the store launch kit — was built end-to-end by **[Claude Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)**, Anthropic's frontier agentic model, working autonomously from goal-level prompts in a single session (concept → tested, packaged product). Direction, product decisions, and publishing by [Phil (Kelevera)](https://github.com/Kelevera).

The repo is published as a demonstration of what long-horizon agentic AI development looks like in practice: the commit you're reading, including this README, is part of that output.

## Roadmap

Content packs (more gears/charms are pure data), achievements and unlockable starting kits, a weekly seeded ladder, touch support, and a Steam build if the itch release finds its audience.

## License

**Free to play, read, learn from, and modify. Commercial distribution is reserved** — that's what keeps the [itch.io release](https://kelevera.itch.io/mainspring) viable as a product while the full source stays public. Licensed under [PolyForm Noncommercial 1.0.0](LICENSE.md). Want to use it commercially? Open an issue.
