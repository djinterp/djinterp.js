# Notes for djinterp's lanes, from the port

2026-11-16, measured again 2026-11-17. Each is for the owner to relay.
The port follows djinterp at `3eb096c9`; everything here was measured on
the reference built from `dfc793c4`, and again from `3eb096c9`, and
holds at both.


## For lane E: the rows as JSON (the owner's ruling D15)

**Ruled:** lane E takes `tools/rows_json.c` as a kit and makes it the
reference's own: one function that writes a frame's rows and its room,
reachable from the program, its shape documented with the option
machine. The port keeps only its test drivers.

**First, a question:** does desc already write `dj_option_env_var`, or
values of it? The port could not ask. If it gives the type's shape and
not a registry's rows, both are wanted.

**The kit**, in the port's `tools/`:

| File | What it does |
|---|---|
| `rows_json.c` | writes the statuses and their messages, the sources, the kinds, the registry's room, and the fixture's frames |
| `json_out.h` | `json_string`, `json_names`, `json_row`, `json_rows`: a row to JSON, used by both |
| `djinterp_fixture_main.c` | the program with `--rows-json COMMIT`, for its own registry |
| `fixture.h` | frames that between them use every field of a row |

**The shape it writes.** A frame:

```json
{ "name": "printer", "parent": "app", "is_djin": true,
  "scopes": ["cpp_features", "summary"],
  "bindings": 64, "vars": 16, "text": 512,
  "rows": [ ... ] }
```

A row, with every field of `dj_option_env_var` (this one is the
fixture's `depth`):

```json
{ "name": "depth", "help": "...", "alias": "max_depth", "knob": null,
  "kind": 2, "refused": 0,
  "integer": "8", "minimum": "0", "maximum": "64",
  "real": "0", "real_bits": "0000000000000000",
  "text": null,
  "names": [ { "name": "unbounded", "value": "9223372036854775807" },
             { "name": "shallow", "value": "2" } ],
  "name_count": 2,
  "unbuilt": [ { "name": "auto", "value": "-1" } ],
  "unbuilt_count": 1 }
```

A row with no names has `"names": null` and a count of 0.

* An integer is a decimal string, since JSON's numbers are doubles and a
  row holds an `int64_t`.
* A real is its `%.17g` text and its 64 bits in hexadecimal. The bits
  are what a reader should trust.
* `bindings`, `vars` and `text` are the frame's room (D5): a frame
  a reader makes from the record is then full where the reference's is.

**What would make it the reference's own:** a test there that every
field of `dj_option_env_var` appears in a row's JSON, so that a field
added to the struct (a REAL's range and step, soon) fails until the
writer has it.


## For lane E: two things found in the option machine

* **`d_option_env_statement_end`** reads past a script's end when it is
  given an offset beyond the terminator. Is that the caller's contract,
  or does it want a guard?
* **A NaN's text is the C library's.** Built with glibc, a REAL bound
  from `-nan` is written back as `-nan`. The port writes `nan` for any
  NaN (the owner's ruling D4), so this is one place the two differ. A
  ranged REAL row will have to say what a NaN is in any case.


## For the lanes that own the program and the kit

* **`djinterp get -- NAME` refuses NAME.**
  `djinterp get -- plugin_path` answers
  `get: the following argument was not expected: plugin_path`, while
  `djinterp get plugin_path` prints it, and `set -- NAME=VALUE` and
  `describe -- DJIN` take their operands after `--`. It looks
  unintended.
* **The kit names half a word.** With several arguments and no command,
  the word it calls "not a command" is cut at the first space of the
  joined arguments: `djinterp 'two words' --x` answers
  `'two' is not a command`. With one argument it names it whole.
* **The parser drops one space** from the end of the arguments it lists
  as unexpected, so an argument that ends with a space is shown without
  it.

The port copies the second and third, and its transcripts hold them. It
does not model `--` yet, so it has not copied the first.
