#!/bin/sh
################################################################################
# djinterp.js [tools]                                              regenerate.sh
#
#   Makes again everything in this repository that comes from the reference,
# for one commit of it:
#     tools/regenerate.sh /path/to/djinterp/djinterp COMMIT [BUILD]
#   The first argument is the directory holding the reference's inc/ and
# src/, checked out at COMMIT; COMMIT is written into every generated file
# and every transcript's `.meta`. BUILD is where the tools are built; a
# directory under /tmp where left out.
#   In order: builds the tools (tools/build.sh); writes generated/*.json and
# the modules beside them; writes the sweep of doubles; makes the fuzzed
# inputs again from their seeds; records every transcript under
# tests/transcripts; and checks that the starting package's four runs
# (tests/transcripts/prototype, kept as they came) are still what the
# reference prints. `node --test` then says whether the port still follows.
#   This is how the port moves to a later commit of djinterp: run it, read
# what `git diff` shows changed in the reference's own words, and bring the
# port after it.
#
#
# path:      /tools/regenerate.sh
# link(s):   TBA
# author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
#                                                            revised: 2026.11.15
################################################################################

set -eu

REF=${1:?the reference: the directory holding inc/ and src/}
COMMIT=${2:?the commit of the reference that directory is checked out at}
BUILD=${3:-/tmp/djinterp.js/build}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")

"$HERE/build.sh" "$REF" "$BUILD"

# the reference's data
"$BUILD/rows_json" option  "$COMMIT" > "$ROOT/generated/option.json"
"$BUILD/rows_json" event   "$COMMIT" > "$ROOT/generated/event.json"
"$BUILD/rows_json" fixture "$COMMIT" > "$ROOT/generated/fixture.json"

# the program's registry: started with no home and no environment, so that
# nothing of the machine it is run on is in it
env -i HOME=/nonexistent XDG_CONFIG_HOME=/nonexistent                         \
    "$BUILD/djinterp_fixture" --rows-json "$COMMIT"                           \
    > "$ROOT/generated/program.json"

# what src/ imports, as modules
node "$HERE/json_module.js" "$ROOT/generated/option.json"                     \
                            "$ROOT/generated/event.json"

# the sweep of doubles: the edges, then 4000 from a fixed seed
"$BUILD/reals" 4000 20261115 > "$ROOT/generated/reals.txt"

# the fuzzed inputs, each from its seed (named in its `.meta`)
T="$ROOT/tests/transcripts"
node "$HERE/fuzz_session.js" 20261115 1500 > "$T/session_fuzz_a.in"
node "$HERE/fuzz_session.js" 7 1500        > "$T/session_fuzz_b.in"
node "$HERE/fuzz_program.js" 20261115 400  > "$T/program_fuzz_a.in"

# the transcripts
node "$HERE/record.js" "$BUILD" "$COMMIT"

# the starting package's four runs are kept as they came, and are not
# recorded again; this commit of the reference is to print the same bytes
for run in bind refuse stops exponent
do
    "$BUILD/option_driver" "$(cat "$T/prototype/$run.in")"                    \
        | cmp -s - "$T/prototype/$run.out"                                    \
        || { echo "prototype/$run: the reference no longer prints this" >&2
             exit 1; }
done

echo "regenerated at $COMMIT; now: node --test"
