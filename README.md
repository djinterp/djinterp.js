# djinterp.js

djinterp's front-end half, in JavaScript: its settings, registry, djin
records, events and the `djinterp` program's commands, in a page, with no
wasm module and no server.

It is a port that follows the C reference, djinterp at `dfc793c4`. The
reference stays the oracle: `tests/transcripts/` holds what it answers,
recorded by the tools in `tools/`, and the port passes when its bytes
agree.

```js
import * as djinterp from './src/djinterp.js';

const dj    = await djinterp.open({ djins: [printer] });
const reply = await dj.run('get --show-origin printer.style');

dj.on('set', (_event) => { /* _event.names */ });
```

```sh
node --test        # node 22 or later; no dependency, no build step
```

* `HANDOFF.md`: what is in it, how it was checked, what is not ported,
  what is next.
* `decisions.html`: the decisions for the owner.
* `docs/JS_STYLE.md`: the style.
* `examples/console.html`: a page with a console over it.
