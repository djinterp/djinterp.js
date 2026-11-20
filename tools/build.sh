#!/bin/sh
################################################################################
# djinterp.js [tools]                                                   build.sh
#
#   Builds the tools against a djinterp tree, unchanged:
#     tools/build.sh /path/to/djinterp/djinterp /path/to/out
#   The first argument is the directory holding the reference's inc/ and src/.
# The reference's own djinterp program is built first, by its own CMake lists
# (build/cmake/config/djinterp/tools/djinterp); the tools then link what that
# built:
#     OUT/rows_json          the reference's data as JSON
#     OUT/session            transcripts of the option machine, the registry
#                            and the djin records
#     OUT/djinterp_fixture   the reference's program over the fixture
#     OUT/reals              "%.*g" of doubles, for the real writer's sweep
#   Needs cc and cmake.
#
#
# path:      /tools/build.sh
# link(s):   TBA
# author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
#                                                            revised: 2026.11.15
################################################################################

set -eu

REF=${1:?the reference: the directory holding inc/ and src/}
OUT=${2:?where the tools are built}
HERE=$(cd "$(dirname "$0")" && pwd)
CC=${CC:-cc}
FLAGS="-std=c99 -Wall -Wextra -pedantic -D_XOPEN_SOURCE=700 -O1"

mkdir -p "$OUT"

# the reference's program, by its own lists
cmake -S "$REF/build/cmake/config/djinterp/tools/djinterp"                    \
      -B "$OUT/reference" -DDJINTERP_PROGRAM_BUILD_TESTS=OFF > "$OUT/cmake.log"
cmake --build "$OUT/reference" -j 8 >> "$OUT/cmake.log"

OBJECTS="$OUT/reference/CMakeFiles/djinterp.dir$REF/src/djinterp"
LIBS="$OUT/reference/libdjinterp_cli.a $OUT/reference/libdjinterp_arg_parser.a"

$CC $FLAGS -isystem "$REF/inc" "$HERE/rows_json.c"                            \
    "$OBJECTS/c/modules/interp/djin.c.o" $LIBS -ldl -o "$OUT/rows_json"

$CC $FLAGS -isystem "$REF/inc" "$HERE/session.c"                              \
    "$OBJECTS/c/modules/interp/djin.c.o" $LIBS -ldl -o "$OUT/session"

$CC $FLAGS -isystem "$REF/inc" -I "$REF/src/djinterp/tools/djinterp"          \
    "$HERE/djinterp_fixture_main.c"                                           \
    "$OBJECTS/tools/djinterp/djinterp_commands.c.o"                           \
    "$OBJECTS/c/modules/interp/djin.c.o" $LIBS -ldl -o "$OUT/djinterp_fixture"

$CC $FLAGS "$HERE/reals.c" -lm -o "$OUT/reals"

echo "built: $OUT/rows_json $OUT/session $OUT/djinterp_fixture $OUT/reals"
