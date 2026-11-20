# djinterp.js: handoff after the first session

2026-11-16. The port follows djinterp at `d20c0b23`.

Read this, then `decisions.html`, which has the seventeen decisions
this session leaves with the owner. `docs/JS_STYLE.md` is the style.

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
| `src/djinterp.js` | what a page imports: `open`, `run`, `on`, `off`; `split`; `memory_file`, `storage_file`; `settings_frame` |
| `src/option/` | the option machine (`option_env`), its registry, statuses |
| `src/modules/interp/djin.js` | djin records, the set, `list` and `describe`'s text |
| `src/event/` | the event core: keys, verdicts, table, registry, dispatcher, queue |
| `src/tools/cli/cli_settings.js` | the kit's settings: start, take, why |
| `src/tools/djinterp/djinterp_commands.js` | the program: `list`, `describe`, `get`, `set` |
| `src/text/` | printf's `%.*g`, strtod's reading, UTF-8 with bytes kept |
| `generated/` | the reference's data, written by `tools/`; never edited |
| `tests/` | 95 tests; `tests/transcripts/` holds the reference's answers |
| `tools/` | C drivers over the reference, the recorder, fuzzers, checks |
| `examples/console.html` | the port in a page |
| `decisions.html` | the decisions for the owner |

Every file under `src/` mirrors a path of the reference and names it in
its banner. A name is the reference's, less `d_` or `dj_`.


## 2. Building in five minutes

There is nothing to build. node 22 or later, and no dependency:

```sh
node --test                  # 95 tests
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
    settings: [djinterp.option_env.row_bool('color', true)],
    file:     djinterp.storage_file(localStorage),
    query:    location.search
});

const reply = await dj.run('get --show-origin color');
// { status: 0, out: 'color = true  (default)\n', err: '' }
dj.on('set', (_event) => { /* _event.names */ });
```

**To follow the reference somewhere else** needs `cc`, `cmake` and a
checkout of djinterp:

```sh
tools/regenerate.sh /path/to/djinterp/djinterp COMMIT
git diff          # what the reference changed, in its own words
node --test       # whether the port still follows
```

It builds the reference's program and the tools, writes `generated/`,
makes the fuzzed inputs again from their seeds, records all fifteen
transcripts, and checks the starting package's four runs. Run twice at
one commit it changes nothing.

**To set the port against the reference on lines nobody typed:**

```sh
node tools/fuzz_check.js BUILD session 1 100 500
node tools/fuzz_check.js BUILD program 1 100 200
```

BUILD is where `regenerate.sh` built the tools (`/tmp/djinterp.js/build`
unless told otherwise).

**The page in a browser** (needs a Chrome or Chromium, which it runs
headless itself; `google-chrome` unless one is named):

```sh
node tools/check_page.js http://127.0.0.1:8765 [/path/to/chrome]
```


## 3. Where the work stands

### What is ported, and how each part was checked

| Part | Check | Result |
|---|---|---|
| real text (`%.17g`, `%.15g`, `%.6g`, `%.1g`; reading) | `tools/reals.c`: 6,778 doubles | 27,112 texts agree; every `%.17g` reads back to the same bits |
| the option machine | 7 hand-typed session transcripts, 2 fuzzed | byte for byte |
| the registry, the djin records | `session_registry`, `session_djin` | byte for byte |
| the program's commands | 3 hand-typed program transcripts, 1 fuzzed | byte for byte |
| both, on fresh seeds | `tools/fuzz_check.js` | 401,400 session lines and 60,000 command lines agree |
| the event core | `t_event_core.c`'s cases, as 13 tests | pass |
| the reference's option suite | `tests/option/suite.test.js` | four groups written out; a table of which transcript holds each other group |
| the page interface | 13 tests; headless Chrome 153 | pass |
| the starting package's four runs | `tests/option/prototype.test.js` | reproduce; the reference at `d20c0b23` still prints them |

A transcript is a file of lines in (`.in`), the reference's bytes out
(`.out`) and what recorded it (`.meta`). `session_*` are given whole to
`tools/session.c`, a line protocol over the option machine, the registry
and the djin set. `program_*` are given a command line a process to the
reference's program with the fixture's frames
(`tools/djinterp_fixture_main.c`), in a home of the transcript's own.

Six deliberate faults were put in, one to a module, to see the gates
fail. Five failed a suite at once. The sixth, in `utf8.js`, failed
nothing: no test encoded a pair whose low surrogate is U+DC00. That case
is now a test, and the fault fails it.

The port was also regenerated against `2bb6b246`, the commit START
names. Nothing differs but the commit's name (decision 1).

### What is not ported

* **The argument parser and the command-line kit.** The program's
  argument reading is a model of them for four commands (decision 11).
  Not modelled: `help`, `completion`, `--help`, `--version`, `-q`, `-v`,
  `--color`, a bare `--`, and short options run together. The port
  answers each as a word it does not know. The fuzzers never produce
  them. The usage text's `Commands:` line lists the port's four.
* **The kit's own djin and the root's `plugin_path`.** They are in
  `generated/program.json`, and the test harness declares them from
  there; `open` does not.
* **The event core's storage:** the arena, buckets, rehashing, reserve,
  statistics, footprint, `next_prime`, and the queue's ring of payload
  bytes. A handler's id is a number. A queue's room is a count of
  occurrences. A queued payload is copied with `structuredClone`
  (decision 13).
* **`D_OPTION_ENV_VALUE_CAPACITY`** as a limit of its own. `format`
  returns the whole text, with no buffer to be too small. `get`'s cuts
  at 511 and 1,023 bytes are the program's and are ported.
* **Hexadecimal reals and `nan(...)`.** The option machine refuses them
  before a reader sees them, so `real_read.js` does not read them.
* **A locale.** The reference's suite has a group for a locale whose
  decimal point is a comma. The port reads and writes a real by its own
  arithmetic, and no locale reaches it.
* **The command language, desc, and everything in START's table below
  them.**

### Where the port chose

Each is a decision in `decisions.html`, with what runs now marked:
integers as numbers or bigints (2); bytes inside (3); a NaN's sign (4);
room (5); promises (6); what a line is (7); the line's words (8); the
query and storage (9); the events' names (10); refusals at `open` (12).

`run` has one known difference from the reference, which no transcript
catches: lines share what they bind (decision 7). Read it before
anything is built on `run`.


## 4. What is next

In order, if the recommendations in `decisions.html` stand:

1. **Decision 7:** `run` as a run of the program, and the program
   transcripts replayed through `run` itself.
2. **Decision 8:** `run` takes the words as well as a line.
3. **Decision 11:** `--`, `-q`, `-v`, `--color`, `--version`, `--help`
   and `help`. Teach `tools/fuzz_program.js` each word first, see it
   differ, then model it. Help texts come from a C tool, as rows do.
4. **Notes to lane E:** a NaN's text (4); the rows' writer and its room
   (5, 15); `d_option_env_statement_end` past a script's end.
5. **A note to the program's and kit's lanes:** `djinterp get -- NAME`
   refuses NAME (`decisions.html`, "Found while preparing this").
6. **A type checker over the JSDoc**, as a tool (17b).
7. **REAL rows' range and step**, when lane E lands them: regenerate,
   read the diff, follow.
8. **After 12-11:** the command language from the frozen grammar, and
   desc's JSON as data.

For whatever is built on it: the option machine and the event core are
usable as they are. The page interface is usable, with decisions 6, 7, 8
and 10 open against it.


## 5. What was learned the hard way

* **A model is exact as far as its fuzzer reaches.** "Did you mean" was
  on the not-ported list, the fuzzer was written to keep away from it,
  and 7,050 fuzzed command lines agreed. A fresh seed then mangled a
  setting's name into `widt`, two edits from `list`. Once the fuzzer
  made near misses on purpose, it found two more differences in minutes,
  and a hand-typed line a fourth. Teach the fuzzer a thing before
  believing the port has it.
* **A check should need as little as the thing it checks.** The page's
  check first drove the browser through an automation library. Chrome
  can be asked for the finished page itself, and now is; the check needs
  a browser and nothing else.
* **The page's own path was the unchecked one.** The transcript harness
  makes a fresh program a line, as the reference is a process a line.
  `open` and `run` do not, so they answer differently after the first
  line and every test passes (decision 7).
* **A deliberate fault that fails nothing is a finding.** One of six
  did.
* **Record in an empty environment.** A fuzzed `import` with an empty
  prefix read the shell's `PATH` into a setting named `path`, on the C
  side only. `tools/record.js` gives the reference no environment but
  what the input sets.
* **The reference borrows text.** `d_option_env_set_text` keeps the
  pointer it is given. `tools/session.c` first passed its line buffer,
  which the next line overwrote. The driver now copies.
* **Text is bytes.** Columns are padded by bytes, offsets are byte
  offsets, limits are byte limits. A port that counts in UTF-16 units
  passes every ASCII test and fails on `é`.
* **The parser's wording has rules of its own.** What a command requires
  is missed before what it does not expect. Every unexpected argument is
  listed. `---x` is a word, not an option. A space that ends the list is
  dropped. The kit names a stray word only as far as its first space.
  All from the source, each confirmed on the binary.
* **`node --test DIRECTORY` does not run a directory.** Run plain
  `node --test`, or name files.
* **Recording must change nothing when nothing changed**, or every
  regeneration is a diff to read. `record.js` keeps a recording's date
  when its bytes and commit are the same, and keeps a person's lines of
  a `.meta` (a fuzzed input's seed and count).
* **`await` on a plain value works**, which is how a synchronous `run`
  passed for the drawn interface until the brief was read again. It
  returns promises now.


## 6. Conventions

`docs/JS_STYLE.md`. It was revised on 11-16 so that it speaks of
djinterp.js alone: what it said of other libraries is gone, and no rule
changed; the file as it came is in the repository's history. Three
things it is silent on were settled by the C guide's habit:

* **A file that is not JavaScript** (`.c`, `.h`, `.sh`, `.html`) has the
  same banner in its own comment form, with its `path:`.
* **A tool that is a program** has its usage in its banner, reads
  `process.argv` in a `main` or at the foot of the file, and exits 2 for
  a wrong call. One that is also imported (`tools/record.js`) runs only
  when it is the program.
* **A test file** has no table of contents or numbered sections. Its
  banner says what it holds and where the rest is held; its tests are
  named for the behaviour, in the reference's words where it has them.

And the port's own:

* **Generated files are never edited.** `tools/regenerate.sh` writes
  them. `src/` imports `generated/*.js`, which `tools/json_module.js`
  makes from the JSON; a test holds the two equal.
* **Every transcript's `.meta` names the commit** the generated data
  names. The tests fail if they differ.
* **An expected failure is a value:** `{ is_ok, value }` or
  `{ is_ok, error }` with the reference's status. A throw is a
  `TypeError` or a `RangeError` for a misuse.
* **A function that takes text has a byte-level twin** under `.bytes`
  (`option_env.bytes`, `djin.bytes`), which the program uses, so that
  what it writes is counted as the reference counts it.
* **Commits** are small and say what was checked. There is no remote.
