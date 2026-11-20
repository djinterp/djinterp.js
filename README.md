# djinterp.js

djinterp's front-end half, in JavaScript: its settings, registry, djin
records, events and the `djinterp` program's commands, in a page, with no
wasm module and no server.

It is a port that follows the C reference, djinterp at `6fe35d43`. The
reference stays the oracle: `tests/transcripts/` holds what it answers,
recorded by the tools in `tools/`, and the port passes when its bytes
agree.

```js
import * as djinterp from './src/djinterp.js';

const dj    = await djinterp.open({ djins: [printer] });
const reply = await dj.run(['get', '--show-origin', 'printer.style']);

dj.on('djinterp.set', (_event) => { /* _event.names */ });
```

A page whose console draws colour says so, `open({ colour: true })`, and
the program's errors, warnings and notes then come with the reference's
escapes, as on a terminal.

```sh
node --test        # node 22 or later; no dependency, no build step
```

* `HANDOFF.md`: what is in it, how it was checked, where it leaves the
  reference by the owner's ruling, what is not ported, what is next.
* `decisions.html`: the decisions for the owner, open and decided.
* `docs/style_guidelines_js.html`: the style, the counterpart of
  djinterp's C and C++ guides.
* `docs/JS_STYLE.md`: tests, generated data, and git and handing back.
* `docs/FOR_THE_LANES.md`: notes for djinterp's lanes, to relay.
* `examples/console.html`: a page with a console over it.
* `types/`: declarations, written by `tools/check_types.js`.
