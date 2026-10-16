# Shuriken Explorer: how the project works

These rules bind every session and every contributor working on Shuriken Explorer.

## 0. Approval

Every step in this document needs the operator's approval before it starts: a reader, a regenerated map, a
port, a rule, a version change, a new view. Nothing is committed unless the operator asks for that commit.

## 1. Game-agnostic

The skill (dc-decomp-kickoff) and Shuriken know no individual game. Their tools are built on game design
techniques: file and model formats, how engines lay out tables, skeletons and draw calls. They are never built
around one title. The one place a game is named in Shuriken's code is its plugin (section 11), which only adds to what the core finds.

The skill's evidence (`references/evidence.md`) is the only place a game is named, and it is there for one
purpose only: to record which games a technique was found or tested on, as proof that it works, and the dead
ends. It never holds a game's data, rules, addresses for use, names or notes. Those belong in that game's decomp.

## 2. Pipeline

Everything Shuriken shows flows one way:

`disc -> skill tool (Python) -> decomp files (game.dcgs, models.txt, src/, tests/) -> Shuriken`

Shuriken adds no knowledge of its own. It reads the disc with format readers, and the decomp tells it what
things are.

## 3. Adding a format

A model, texture, motion or sound format:

1. Write the reader in the skill's Python tools; it writes rows into `game.dcgs`.
2. Regenerate the map of a game that uses the format and check the rows.
3. Port the reader to Shuriken's `disc/`. On the same disc it must find the same items as the Python reader.
4. Display: the new rows show through the existing views, or through a new view.

## 4. Adding a game

1. Start or upgrade its decomp with the skill, to the current version.
2. Its map must load with no rules: every recognised model is listed.
3. Write rules in `models.txt` (tables, skeletons, texture pairs, extras) until the game's characters and props
   assemble properly.
4. Only rules and names go into the decomp. Shuriken stays free of anything specific to one game.

## 5. Adding a rule kind

The grammar goes into the skill's `model_map.py` and its documentation first. A decomp gets the new rule kind
only when the operator upgrades that decomp, through the skill's upgrade path. Shuriken learns the new section,
and maps that don't have it yet still read as before.

## 6. Versions

The map carries the skill's version (`# dcgs <version>`). Shuriken reads every map version from its floor up,
through its version table: v0.6 now, v1.0 at release. A breaking format change adds a reader entry, and older
versions are dropped by raising the floor.

## 7. Categories and order

Models come first: Models, Skeletons, Textures. Then Audio and Code. Text and Images come after models work for
every target game. Each category takes its data from the decomp, except Models, which are scanned from the disc
and named by the map.

## 8. Empty means something

An empty category shows the normal no-results state. If the decomp's local files are missing, Shuriken tells
the user to run setup in their decomp.

## 9. Phases

Read (now) -> eXecute (run functions and their test cases with the SH-4 simulator in the browser) -> Write
(later).

## 10. Checks

Both repos have a pre-commit hook; enable it once per clone with `git config core.hooksPath .githooks`.

- The skill's hook keeps its readers backwards compatible: what they found in the synthetic test inputs before, they still
  find (`tests/compat`). A deliberate break is recorded with `check.py --update --breaking <version>`.
- Shuriken's hook type-checks, runs its readers on the same inputs and compares every result with the skill's, and checks
  it has a reader for every version the skill recorded as breaking (`app/test/run.sh`). It keeps up: a breaking skill change
  and Shuriken's new reader entry land in the same step.

## 11. Game plugins

A game that needs logic of its own gets a plugin: `app/src/games/<product number>/index.ts` and one file per asset type beside it. The folder is
named after the product number in the game's IP.BIN (Illbleed's is `T45601M`; a space in it becomes `_`, as in `T23001D_50`), which differs per region, so each region has its own plugin. A plugin
can list the versions it serves; with none listed it serves every version. The core always runs first, and a plugin works on top of its result.

Rules for anyone working on a game, person or agent:

- Edit only `app/src/games/<product number>/`. Do not change the core, the skill, another game, or the tests. Something that would help other games is a
  proposal for the owner, in a separate change.
- Import only from `app/src/lib/plugin-api.ts`. A plugin adds (readers, items, the encoding and split its text files open with, the transforms of tagged model nodes, which the core applies none of) or hides (a test that the list's "hidden" toggle undoes). It cannot
  remove or change what the core found.
- Do not copy what the core already does. A format several games share belongs in the core and the skill.
- Keep `npx vue-tsc -b` passing. Never commit a game's bytes or text.
- A plugin that throws is skipped, and the tab shows the core's result.

A change outside `games/<product number>/` needs the owner's review. Shared logic moves down into the core and the skill over time.
