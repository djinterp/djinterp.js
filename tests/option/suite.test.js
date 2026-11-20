/*******************************************************************************
* djinterp.js [tests]                                              suite.test.js
*
*   The reference's own suite of the option machine
* (tests/unintegrated/c/option/t_option_env.c, at d20c0b23), group by
* group, and where the port has each group's cases.
*   Most are in the session transcripts, where the reference itself gives
* the answers:
*     declarations         session_names, session_room (declare_bad, vars)
*     values               session_kinds (set, raw_get), session_sources
*     scopes_and_frames    session_sources, session_room (attach, detach)
*     text, text_more      session_kinds, session_statements, session_bytes
*     scripts              session_scripts
*     environment          session_registry (env, import)
*     arena                session_room
*     sources, layered     session_sources, session_statements,
*                          session_room, session_names
*     rows, named_ints,    session_kinds, session_sources, session_registry
*       named_rules
*     refused              session_sources, session_registry
*     suggestions          session_names
*     random               session_fuzz_a, session_fuzz_b
*   Four groups are whole in themselves -- they ask the machine a question
* whose answer is in the question -- and are written out again here, check
* for check: the deepest chain, writing what loads back (every kind, then
* text), and reading on a hot path.
*   One group has nothing to be a case of: `locale`. The port reads and
* writes a real by its own arithmetic (src/text), and no locale reaches
* it.
*
*
* path:      /tests/option/suite.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STATUS, fail } from '../../src/option/option_common.js';
import * as option_env from '../../src/option/option_env.js';

const { GLOBAL, KIND } = option_env;

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = (2n ** 63n) - 1n;

// the suite's FORMATS, BITS and DEPTHS
const FORMATS = [{ name: 'plain', value: 0 }, { name: 'json', value: 1 }];
const BITS    = [{ name: 'a', value: 1 }, { name: 'b', value: 2 },
                 { name: 'c', value: 4 }];
const DEPTHS  = [{ name: 'unbounded', value: 0 }];

/*
trip_rows
  The suite's D_TESTS_TRIP_ROWS: a row of every kind, for writing what
loads back.
*/
function trip_rows()
{
    return [
        option_env.row_bool('flag', 0),
        option_env.row_int('count', 0),
        { kind: KIND.INT, name: 'depth', integer: 1, minimum: 1, maximum: 9,
          names: DEPTHS },
        option_env.row_real('ratio', 0.0),
        option_env.row_text('title', null),
        option_env.row_choice('format', FORMATS, 0),
        option_env.row_flags('bits', BITS, 0)
    ];
}

/*
trip_frames
  Two frames over the trip's rows: one to write from, one to load into.
*/
function trip_frames()
{
    const from = option_env.init();
    const to   = option_env.init();

    assert.equal(option_env.declare_all(from, trip_rows()).is_ok, true);
    assert.equal(option_env.declare_all(to, trip_rows()).is_ok, true);

    return { from: from, to: to };
}

/*
trip
  The suite's d_tests_option_env_trip: writes a variable's value as
format_quoted does, loads the statement into a second frame as a script,
and says whether the same value came back: a real's bits, a text's bytes,
the others' integers.
*/
function trip(
    _from,
    _to,
    _var
)
{
    const name   = option_env.var_at(_from, _var).name;
    const quoted = option_env.format_quoted(_from, GLOBAL, _var);

    if ( (quoted === null) ||
         !option_env.load(_to, name + '=' + quoted).is_ok )
    {
        return false;
    }

    const want = option_env.get(_from, GLOBAL, _var).got;
    const got  = option_env.get(_to, GLOBAL, _var).got;

    switch (want.kind)
    {
        case KIND.REAL:
            return Object.is(want.real, got.real) &&
                   (want.negative_nan === got.negative_nan);

        case KIND.TEXT:
            return (want.text !== null) &&
                   (got.text !== null)  &&
                   (want.text === got.text);

        default:
            return (want.integer === got.integer);
    }
}

test('deepest: the deepest chain allowed, and one frame past it', () =>
{
    const past  = option_env.DEPTH_MAX + 1;
    const chain = [];

    for (let i = 0; i <= past; ++i)
    {
        chain.push(option_env.init({ bindings: 1, vars: 0, text: 0 }));

        // a chain as deep as allowed; the last frame is left a root
        if ( (i > 0) &&
             (i < past) )
        {
            option_env.set_parent(chain[i], chain[i - 1]);
        }
    }

    assert.equal(chain[option_env.DEPTH_MAX].depth, option_env.DEPTH_MAX);
    assert.deepEqual(option_env.set_parent(chain[past],
                                           chain[option_env.DEPTH_MAX]),
                     fail(STATUS.CAPACITY));
    assert.equal(option_env.root(chain[option_env.DEPTH_MAX]), chain[0]);
});

test('round_trip: writing what loads back, every kind', () =>
{
    const REALS        = [0.1, -2.5e-300, 1e300, 123456789.123456789, -0.0];
    const { from, to } = trip_frames();

    option_env.set_bool(from, GLOBAL, 0, true);
    assert.ok(trip(from, to, 0));

    option_env.set_int(from, GLOBAL, 1, INT64_MIN);
    assert.ok(trip(from, to, 1));
    assert.equal(option_env.int(to, GLOBAL, 1), INT64_MIN);
    option_env.set_int(from, GLOBAL, 1, INT64_MAX);
    assert.ok(trip(from, to, 1));
    assert.equal(option_env.int(to, GLOBAL, 1), INT64_MAX);

    option_env.put(from, 'depth=unbounded');
    assert.ok(trip(from, to, 2));
    assert.equal(option_env.int(to, GLOBAL, 2), 0);
    option_env.set_int(from, GLOBAL, 2, 7);
    assert.ok(trip(from, to, 2));
    assert.equal(option_env.int(to, GLOBAL, 2), 7);

    for (const real of REALS)
    {
        option_env.set_real(from, GLOBAL, 3, real);
        assert.ok(trip(from, to, 3), String(real));
    }

    option_env.put(from, 'format=json');
    assert.ok(trip(from, to, 5));
    option_env.put(from, 'bits=a|b');
    assert.ok(trip(from, to, 6));
    assert.equal(option_env.int(to, GLOBAL, 6), 3);
    option_env.set_int(from, GLOBAL, 6, 0);
    assert.ok(trip(from, to, 6));
    assert.equal(option_env.int(to, GLOBAL, 6), 0);
});

test('round_trip_text: text loads back as it was, whatever it holds', () =>
{
    const TEXTS = [
        'plain',       'two words',  ' leading',      'trailing ', '',
        'a # b',       'a; b',       'say "hi"',      'back\\slash',
        'line\nbreak', 'tab\tin',    '\x01ctl',       'über',
        '=equals',     '-dash'
    ];
    const { from, to } = trip_frames();

    for (const text of TEXTS)
    {
        option_env.set_text(from, GLOBAL, 4, text);
        assert.ok(trip(from, to, 4), JSON.stringify(text));
        assert.equal(option_env.text(to, GLOBAL, 4), text);
    }

    // quotes only where they are needed
    option_env.set_text(from, GLOBAL, 4, 'two words');
    assert.equal(option_env.format_quoted(from, GLOBAL, 4), 'two words');
    option_env.set_text(from, GLOBAL, 4, 'say "hi"\n');
    assert.equal(option_env.format_quoted(from, GLOBAL, 4),
                 '"say \\"hi\\"\\n"');
    assert.equal(option_env.format(from, GLOBAL, 4), 'say "hi"\n');

    // a null text writes nothing; space around '='
    option_env.unset(from, GLOBAL, 4);
    assert.equal(option_env.format_quoted(from, GLOBAL, 4), '');
    assert.equal(option_env.load(to, 'title = " padded "').is_ok, true);
    assert.equal(option_env.text(to, GLOBAL, 4), ' padded ');
    assert.equal(option_env.load(to, 'count = 5').is_ok, true);
    assert.equal(option_env.int(to, GLOBAL, 1), 5n);
});

test('hot_path: a cache reads again only when the chain has moved', () =>
{
    const root  = option_env.init();
    const child = option_env.init();
    const cache = {};

    option_env.declare(root, option_env.row_int_range('key_width', 24, 1,
                                                      120));
    option_env.set_parent(child, root);

    assert.equal(option_env.cached(child, GLOBAL, 0, cache).integer, 24);

    // the cache is what is read, until the generation moves
    cache.value.integer = 999;
    assert.equal(option_env.cached(child, GLOBAL, 0, cache).integer, 999);
    option_env.set_int(root, GLOBAL, 0, 31);
    assert.equal(option_env.cached(child, GLOBAL, 0, cache).integer, 31);
    option_env.set_int(child, GLOBAL, 0, 32);
    assert.equal(option_env.cached(child, GLOBAL, 0, cache).integer, 32);
    assert.equal(option_env.cached(child, GLOBAL, 99, {}).kind, 0);
    assert.equal(option_env.cached(child, GLOBAL, 0, null), null);
});

test('past the suite: every double of the sweep loads back to the bit',
     () =>
{
    const lines = readFileSync(new URL('../../generated/reals.txt',
                                       import.meta.url), 'latin1')
                      .split('\n').filter((_line) => (_line.length !== 0) &&
                                                     !_line.startsWith('#'));
    const { from, to } = trip_frames();
    const view  = new DataView(new ArrayBuffer(8));
    let   count = 0;

    for (const line of lines)
    {
        view.setBigUint64(0, BigInt('0x' + line.split(' ')[0]));

        const real = view.getFloat64(0);

        // a NaN's sign is the one thing a number cannot hand in
        if (Number.isNaN(real))
        {
            continue;
        }

        option_env.set_real(from, GLOBAL, 3, real);
        assert.ok(trip(from, to, 3), line);
        ++count;
    }

    assert.ok(count > 6000, String(count));
});
