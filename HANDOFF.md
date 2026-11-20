# djinterp.js: handoff

2026-11-17. The port follows djinterp at `dfc793c4`.

Read this, then `decisions.html`: its open decisions first, and every
ruling so far below them, each with all that was put for it and where it
stands. Decisions have one number across pages, D1 to D27; this file
names them so.
`docs/JS_STYLE.md` is the style. `docs/FOR_THE_LANES.md` has the notes
for djinterp's lanes.

**djinterp.js is ignorant of every framework but itself** (the owner,
2026-11-16). Nothing in this repository names or needs another library:
not its sources, its tests, its tools, its example or its documents. The
one other thing it knows is djinterp, the C it is a port of and follows
by name.


## 1. What is in it

djinterp's front-end half, in JavaScript: a page that imports
`src/djinterp.js` has djinterp's settings, registry, djin records, events
and the `djinterp` program's four commands, with no wasm module and no
server.

| Path | What |
|---|---|
| `src/djinterp.js` | what a page imports: `open`, `run`, `on`, `off`; `split`; `memoryFile`, `storageFile`; `settingsFrame` |
| `src/option/` | the option machine (`optionEnv`), its registry, statuses |
| `src/modules/interp/djin.js` | djin records, the set, `list` and `describe`'s text |
| `src/event/` | the event core: keys, verdicts, table, registry, dispatcher, queue |
| `src/tools/cli/cli_settings.js` | the kit's settings: start, take, why |
| `src/tools/djinterp/djinterp_commands.js` | the program: `list`, `describe`, `get`, `set` |
| `src/text/` | printf's `%.*g`, and strtod's reading |
| `generated/` | the reference's data, written by `tools/`; never edited |
| `types/` | declarations, written by `tools/check_types.js`; never edited |
| `tests/` | 97 tests; `tests/transcripts/` holds the reference's answers |
| `tools/` | C drivers over the reference, the recorder, fuzzers, checks |
| `examples/console.html` | the port in a page |
| `decisions.html` | the decisions for the owner, open and decided |

A file under `src/` mirrors a path of the reference and keeps its name.
A function's name is the reference's in camelCase, less `d_` or `dj_`:
`d_option_env_assign_from` is `optionEnv.assignFrom`.


## 2. Building in five minutes

There is nothing to build. node 22 or later, and no dependency:

```sh
node --test                  # 97 tests
node tools/check_style.js    # 80 columns, tabs, banners
```

A page, from the repository's top:

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/examples/console.html
```

```js
import * as djinterp from './src/djinterp.js';

const dj = await djinterp.open({
    settings: [djinterp.optionEnv.rowBool('color', true)],
    file:     djinterp.storageFile(localStorage),
    query:    location.search
});

const reply = await dj.run('get --show-origin color');
// { status: 0, out: 'color = true  (default)\n', err: '' }
await dj.run(['set', 'color=no']);      // the words, untouched
dj.on('djinterp.set', (_event) => { /* _event.names */ });
```

**To follow the reference somewhere else** needs `cc`, `cmake` and a
checkout of djinterp:

```sh
tools/regenerate.sh /path/to/djinterp/djinterp COMMIT
git diff          # what the reference changed, in its own words
node --test       # whether the port still follows
```

It builds the reference's program and the tools, writes `generated/`,
makes the fuzzed inputs again from their seeds, records all sixteen
transcripts, checks the starting package's four runs, and writes the
commit into the banners. Run twice at one commit it changes nothing.

**The other checks**, none of which `node --test` runs:

```sh
node tools/fuzz_check.js BUILD session 1 100 500
node tools/fuzz_check.js BUILD program 1 100 200
node tools/check_page.js http://127.0.0.1:8765 [/path/to/chrome]
node tools/check_types.js /path/to/typescript/bin/tsc
```

BUILD is where `regenerate.sh` built the tools (`/tmp/djinterp.js/build`
unless told otherwise). The page's check runs a Chrome or Chromium
headless itself. The types' check needs a TypeScript compiler, 5.5 or
later, which the repository does not depend on.


## 3. Where the work stands

### What is ported, and how each part was checked

| Part | Check | Result |
|---|---|---|
| real text (`%.17g`, `%.15g`, `%.6g`, `%.1g`; reading) | `tools/reals.c`: 6,778 doubles | 27,112 texts agree; every `%.17g` reads back to the same bits |
| the option machine | 7 hand-typed session transcripts, 2 fuzzed | byte for byte |
| the registry, the djin records | `session_registry`, `session_djin` | byte for byte |
| the program's commands, **through `run`** | 4 hand-typed program transcripts, 1 fuzzed | byte for byte |
| the parser and the kit, as the program reads its command line | `program_kit`, 190 lines; 100,000 fuzzed command lines | byte for byte, but `--version` at `-v` (D26) |
| both, on fresh seeds | `tools/fuzz_check.js` | agree; see below |
| the event core | `t_event_core.c`'s cases, as 13 tests | pass |
| the reference's option suite | `tests/option/suite.test.js` | four groups written out; a table of which transcript holds each other group |
| the page interface | 16 tests; headless Chrome 153 | pass |
| the JSDoc, as types | `tools/check_types.js`, TypeScript 5.9.3 | no finding; seven modules of sixteen held to the strict mode (D24) |
| the starting package's four runs | `tests/option/prototype.test.js` | reproduce |

A transcript is a file of lines in (`.in`), the reference's bytes out
(`.out`) and what recorded it (`.meta`). `session_*` are given whole to
`tools/session.c`, a line protocol over the option machine, the registry
and the djin set. `program_*` are given a command line a process to the
reference's program with the fixture's frames
(`tools/djinterp_fixture_main.c`), in a home of the transcript's own.

Fuzzing. Before the rulings, 401,400 session lines and 60,000 command
lines agreed. After each ruling that touched the machine the fuzzers
were run again on fresh builds of the port: session seeds 1 to 60 at 400
lines, and program seeds 1 to 80 at 200 lines through `run` itself, all
agree.

### Where the port leaves the reference, by the owner's ruling

These are differences on purpose. Each has a test that names it.

* **Text is counted in UTF-16 units** (D3). The reference counts
  bytes: an offset into a script, a column's width in `list` and
  `describe`, `get`'s cut at 511, a frame's room for text. For ASCII
  the two agree. For `é` the port counts one where the reference counts
  two. The transcripts are replayed with a unit for each of the
  reference's bytes, which holds the port to it on everything but that
  count. A `\xHH` in a script is the unit `HH`, where in the reference
  it is a byte that may be part of a longer character. A cut that would
  part a surrogate pair is one unit earlier (D23).
* **Any NaN is `nan`** (D4). The reference, built with glibc,
  writes a REAL bound from `-nan` back as `-nan`. No transcript or
  fuzzed input makes a signed NaN any more.
* **An event's key is still the reference's**: the FNV-1a-64 hash of the
  name's UTF-8 bytes, for any name (D21).

### What the rulings changed in how it behaves

* **A line is a run of the program** (D7). Before each line the
  port starts again as a process would: what the last line bound from
  the environment, the settings file, its command line or by `set` is
  dropped, and the environment and the file are read again. So `set`'s
  value reads `(file)` on the next line, an option of a line binds for
  that line, and what the program says as it starts comes first in every
  reply's `err`. What a page bound at the program's standing stays. The
  query is the command line of every line (D22).
* **`run` takes a line or an array of words** (D8). The words go
  to the program untouched.
* **The program posts `djinterp.set` and `djinterp.run`** (D10).
* **The program reads its command line as the reference's does** (D11,
  D18 to D20): `help`, `completion`, `--help`, `--version`, `-h`, `-q`
  and `-v` alone or run together, `--color` with its word, and `--`
  with the reference's own meaning for it, `get`'s refusal of what
  follows it included. Help's texts, the version and each shell's
  completion script are the reference's own, in `generated/kit.json`.
* **A frame from its record has the reference's room** (D5):
  `optionEnv.fromRecord`.

### What is not ported

* **`--version` at `-v`.** The reference names the file and the compiler
  of its own build; the port writes the version alone, and the fuzzer
  keeps from it (D26, open).
* **Colour where a page could show it.** `--color=auto` is no colour,
  since the port is never a terminal; `--color=always` writes the
  reference's escapes, which the example page shows as text (D27, open).
* **The argument parser and the kit, whole.** The program's reading of
  its command line is a model of them, exact as far as its fuzzer
  reaches. A port of them whole is asked again with the command language
  after 12-11 (D11).
* **The kit's own djin and the root's `plugin_path`.** They are in
  `generated/program.json`, and the test harness declares them from
  there; `open` does not.
* **The event core's storage:** the arena, buckets, rehashing, reserve,
  statistics, footprint, `next_prime`, and the queue's ring of payload
  bytes. A handler's id is a number. A queue's room is a count of
  occurrences. A queued payload is copied with `structuredClone`
  (D13).
* **`D_OPTION_ENV_VALUE_CAPACITY`** as a limit of its own. `format`
  returns the whole text.
* **Hexadecimal reals and `nan(...)`.** The option machine refuses them
  before a reader sees them.
* **A locale.** The port reads and writes a real by its own arithmetic.
* **The command language, desc, and everything in START's table below
  them.**


## 4. What is next

1. **D25, then D24's second tranche:** the strict mode for the nine
   modules left (562 findings), a module at a time, in the form D25
   gives their 72 inner comments. `tools/check_types.js` holds a module
   to it once it is listed in `STRICT`.
2. **D26 and D27** as ruled: `--version` at `-v`, and colour in a page.
3. **Relay `docs/FOR_THE_LANES.md`** (D15, D4, D18, and what was found in
   the program and the kit). When lane E lands the rows' writer,
   regenerate and bring the port's reader after it.
4. **D14:** the move into djinterp's tree, when the tree has CI to run
   the transcripts.
5. **REAL rows' range and step**, when lane E lands them: regenerate,
   read the diff, follow.
6. **After 12-11:** the command language from the frozen grammar, desc's
   JSON as data, and D11's question of the parser whole.


## 5. What was learned the hard way

* **A model is exact as far as its fuzzer reaches.** "Did you mean" was
  on the not-ported list, the fuzzer was written to keep away from it,
  and 7,050 fuzzed command lines agreed. A fresh seed then mangled a
  setting's name into `widt`, two edits from `list`. Once the fuzzer
  made near misses on purpose, it found two more differences in minutes,
  and a hand-typed line a fourth. Teach the fuzzer a thing before
  believing the port has it.
* **The page's own path was the unchecked one.** The transcript harness
  made a fresh program a line, as the reference is a process a line,
  and `run` did not. D7 closed it: the harness now replays through
  `run`.
* **A deliberate fault that fails nothing is a finding.** One of six
  did, and became a test.
* **`git checkout FILE` to undo an experiment undoes everything
  uncommitted in the file.** It cost two re-dos in one day. Copy the
  file aside and copy it back, or commit first.
* **A type checker's first run is a review.** 119 findings: types named
  across modules with nothing importing them, a type never defined, a
  typedef missing a member, a handful of real mismatches. An alias made
  with `@typedef` is exported again by `export *`; `@import` is not.
* **A rename can keep what was aligned aligned.** 298 names went from
  snake_case to camelCase by a tokenising script that re-indented
  continuation lines by what the line above them lost and re-padded
  aligned columns. Every test, both fuzzers and the style check passed
  on its first run. It is not in the repository; the names are.
* **Record in an empty environment.** A fuzzed `import` with an empty
  prefix read the shell's `PATH` into a setting named `path`, on the C
  side only.
* **The reference borrows text.** `d_option_env_set_text` keeps the
  pointer it is given, and `tools/session.c` first passed its line
  buffer. The driver now copies.
* **The parser's wording has rules of its own.** What a command requires
  is missed before what it does not expect. Every unexpected argument is
  listed. `---x` is a word, not an option. A space that ends the list is
  dropped. The kit names a stray word only as far as its first space.
* **A check should need as little as the thing it checks.** The page's
  check runs Chrome itself; nothing drives it.
* **`node --test DIRECTORY` does not run a directory.**
* **Recording must change nothing when nothing changed.** `record.js`
  keeps a recording's date when its bytes and commit are the same.


## 6. Conventions

`docs/JS_STYLE.md`. Since the rulings: identifiers in camelCase, a
type's name in PascalCase, constants, files and data in the reference's
spelling (JS1); JSDoc read as types by a tool (JS2). Three things the
style is silent on were settled by the C guide's habit:

* **A file that is not JavaScript** (`.c`, `.h`, `.sh`, `.html`) has the
  same banner in its own comment form, with its `path:`.
* **A tool that is a program** has its usage in its banner and exits 2
  for a wrong call. One that is also imported (`tools/record.js`) runs
  only when it is the program.
* **A test file** has no table of contents or numbered sections. Its
  banner says what it holds and where the rest is held.

And the port's own:

* **Generated files are never edited.** `tools/regenerate.sh` writes
  `generated/`, and `tools/check_types.js` writes `types/`.
* **Every transcript's `.meta` names the commit** the generated data
  names. The tests fail if they differ.
* **An expected failure is a value:** `{ isOk, value }` or
  `{ isOk, error }` with the reference's status. A throw, or a promise
  broken, is a `TypeError` or a `RangeError` for a misuse.
* **A module's exported functions check what they are handed; its
  `inner` has the same functions without the checks**, for the modules
  that stand on it.
* **A type another module defines is brought in with `@import`**, in a
  block after the imports.
* **Commits** are small and say what was checked. There is no remote.
