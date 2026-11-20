# djinterp.js: tests, generated data, and handing back

Written 2026-11-14 for the agent starting djinterp.js, as its provisional
house style. Revised 2026-11-16, to name no other library, and
2026-11-17, at the owner's ruling D25.

**The style is not here.** At the owner's ruling D28 (2026-11-17),
`docs/style_guidelines_js.html` is djinterp.js's file of style, written in
the form of djinterp's C and C++ guides and changed only through the owner
(JS3 moved to it). This file keeps what is not style: how the port is
tested, where its data comes from, and how work is committed and handed
back. Its sections 1 to 3 were sections 6 to 8. Everything else it held,
the rulings JS1 to JS3 among them, is in the guide; the file as it was is
in the repository's history.


## 1. Tests

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


## 2. Generated data

Whatever the reference holds as data -- rows and their ranges, element
types, attributes and defaults, archetype contracts, status codes and
their messages -- is written out as JSON by a tool in `tools/` and read
by the port. It is never typed again in JavaScript. Each generated file's
first field names the reference's commit.


## 3. Git and handing back

* A commit a change, each passing `node --test`; your own attribution in
  each message.
* Never push. There is no remote.
* Hand back as the repository zipped whole, `.git` included, with a
  `HANDOFF.md` at the top, in this form: what is in it; building in five
  minutes; where the work stands; what is next; what was learned the
  hard way; conventions.
