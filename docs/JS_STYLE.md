# JavaScript in djinterp.js: a provisional house style

Written 2026-11-14 for the agent starting djinterp.js. Revised 2026-11-16
at the owner's word that djinterp.js is ignorant of every framework but
itself: what spoke of other libraries is gone, and no rule has changed.
The file as it came is in the repository's history.

**Standing.** All of this is **recommended**. The owner has not ruled on
JavaScript's home or style (the morning's note, J2). Where it is silent,
follow djinterp's house style as far as the language allows. If you
change a rule here, say so in your handoff.

There is no JavaScript anywhere in djinterp's tree (**measured**,
11-13). These are the first rules.


## 1. What the code is

* **ES modules**, in `.js` files, with `"type": "module"` in
  `package.json`. A `.js` file is served with a JavaScript type by every
  server; `.mjs` is not, everywhere.
* **No build step.** What is in the repository is what a page imports.
* **No dependency at run time.** Not one package. Tests and tools may use
  what node ships with.
* **The same code in a browser and in node.** Nothing under `src/` reads
  a node built-in (`fs`, `process`, `Buffer`). Node is for `tests/` and
  `tools/`.
* **Node 22** for tests: `node --test`, with `node:test` and
  `node:assert/strict`. (The sandbox these notes were written in has node
  22.23.)
* **No globals.** A module exports what it offers and touches nothing it
  did not import.


## 2. Layout

```
package.json
src/MODULE/FILE.js        mirrors the reference's own path:
                          djinterp's c/option/option_env.h becomes
                          src/option/option_env.js
tests/MODULE/FILE.test.js
tests/transcripts/        recorded from the reference (section 6)
tools/                    C programs that record transcripts and write
                          the generated data, built against the
                          reference unchanged
generated/                what the tools write; committed; never edited
                          by hand
```

The reference is the C the port follows: djinterp.


## 3. The file

The banner is the reference's, in a JavaScript comment, 80 columns wide,
with the reference's fields:

```js
/*******************************************************************************
* djinterp.js [option]                                             option_env.js
*
*   What the file is, in a few sentences of plain prose, as the reference's
* banners are written. Name the reference it ports:
*   reference: inc/djinterp/c/option/option_env.h, at 2bb6b246
*
* path:      /src/option/option_env.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/
```

Then, as the reference's headers have it: a numbered `TABLE OF CONTENTS`
for a file with sections, and numbered dividers matching it.

* 80 columns, four spaces, no tabs, no trailing blanks, a final line
  break.
* Braces on their own lines for functions and classes, as the reference
  has them; the same for blocks wherever it reads well.
* Parameters `_name`, as the reference's are. Private fields `#m_name`.
* A short `// name` / `//   kind: ...` note on small declarations; a JSDoc
  block (`@param`, `@returns`, with types) on everything exported. JSDoc
  is how a reader and an editor get types with no build step.
* Prose in comments says what is true, plainly. No "we".


## 4. Names

* **Identifiers follow the reference's names, in snake_case**, as
  djinterp's C names are. The module is the namespace, so the C prefix
  goes: `d_option_env_load` is `option_env.load`.
* **Data keeps the reference's spelling exactly**: a row's name, an
  attribute's key, a field of a record or of generated JSON
  (`sidebar_width`, `bind.value`).
* The interface a page calls is short words that need no case:
  `open`, `run`, `on`, `mount`.

This is the one rule here a web developer will notice. The alternative
is camelCase, which is the language's convention. (JS1.)


## 5. Behaviour that must match the reference

1. **Expected failures are values, not exceptions.** Where the reference
   returns a status, the port returns the same status, by the same code
   and name, with the reference's message: a row out of range is refused
   as djinterp refuses it. Throw only for a misuse no correct caller
   makes, such as a wrong type passed by the programmer.
2. **Integers.** A JavaScript number is exact to 2^53 − 1. A value is a
   `number` when its range lies inside ±(2^53 − 1), and a `bigint` when
   it does not; a row with no stated range is a `bigint` if the reference
   holds it in 64 bits. Never redo 64-bit arithmetic in `number`s. (The
   djinterp.js note's J11, option C.)
3. **Reals as text.** Never `String(v)`, `toFixed` or `toPrecision`.
   The reference and JavaScript write reals differently. **Measured**,
   2026-11-14, from the reference's own code:

   | Value | djinterp `option_env` (`%.17g`) | JavaScript `String(v)` |
   |---|---|---|
   | `0.1` | `0.10000000000000001` | `0.1` |
   | `1.0/3` | `0.33333333333333331` | `0.3333333333333333` |
   | `420.0` | `420` | `420` |
   | `-0.0` | `-0` | `0` |
   | `1e15` | `1000000000000000` | `1000000000000000` |
   | `1e21` | `1e+21` | `1e+21` |
   | `1.5e-7` | `1.4999999999999999e-07` | `1.5e-7` |
   | `2.5e-5` | `2.5000000000000001e-05` | `0.000025` |
   | `5e-324` | `4.9406564584124654e-324` | `5e-324` |
   | `-2.75` | `-2.75` | `-2.75` |

   djinterp writes `snprintf("%.17g")` (`option_env.c`,
   `d_internal_option_env_format_real`). The port has one function that
   reproduces that writer, tested against this table and a sweep of
   doubles printed by the reference: printf's `%.*g` written in
   JavaScript, at `src/text/real_format.js`.
4. **Reals from text.** Never `Number()` or `parseFloat`. `Number("")` is
   0; `Number("0x10")` is 16 but `Number("0x1p3")` is NaN, which `strtod`
   reads as 8; `parseFloat("1abc")` is 1. Read to the grammar the
   reference accepts, and refuse the rest as it does.
5. **Order.** Where the reference's output has an order -- a list of
   rows, a patch stream, a printed document -- the port produces that
   order on purpose. Insertion order in a `Map` is not a reason.
6. **Nothing a result depends on reads the clock or `Math.random`.**


## 6. Tests

**The reference is the oracle.** A port passes when it gives the
reference's bytes.

A **transcript** is three files in `tests/transcripts/`:

| File | Holds |
|---|---|
| `NAME.in` | what was given to the reference: lines as typed, one a line |
| `NAME.out` | what it wrote, byte for byte |
| `NAME.meta` | the program, its arguments, the reference's repository and commit, the date recorded |

A transcript is recorded by a tool in `tools/`, never written by hand. A
test replays `NAME.in` through the port and compares with `NAME.out`
exactly. When the reference moves, the transcripts are recorded again at
the new commit, and the difference is a change to review, not to accept.

Beside the transcripts, each of the reference's own suites that covers a
ported behaviour has its cases written again as node tests.


## 7. Generated data

Whatever the reference holds as data -- rows and their ranges, element
types, attributes and defaults, archetype contracts, status codes and
their messages -- is written out as JSON by a tool in `tools/` and read
by the port. It is never typed again in JavaScript. Each generated file's
first field names the reference's commit.


## 8. Git and handing back

* A commit a change, each passing `node --test`; your own attribution in
  each message.
* Never push. There is no remote.
* Hand back as the repository zipped whole, `.git` included, with a
  `HANDOFF.md` at the top, in this form: what is in it; building in five
  minutes; where the work stands; what is next; what was learned the
  hard way; conventions.


## 9. Decisions for the owner

**JS1. Names.** A. The reference's names, in snake_case (section 4). B.
camelCase, the language's convention. Runs as **A**: a
port that reads like its reference is one that can be checked against
it.

**JS2. Types.** A. JSDoc in the sources; declarations generated from it
later. B. TypeScript sources, which need a build step. Runs as **A**: no
build step.

**JS3. One file of style, or two.** Settled by the owner's word of
2026-11-16: this file is djinterp.js's own, and it is changed only
through the owner.
