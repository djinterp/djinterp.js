/*******************************************************************************
* djinterp.js [tests]                                              suite.test.js
*
*   The reference's own suite of the option machine
* (tests/unintegrated/c/option/t_option_env.c, at 3eb096c9), group by
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
*                                                            revised: 2026.11.16
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { STATUS, fail } from '../../src/option/option_common.js';
import * as optionEnv from '../../src/option/option_env.js';

const { GLOBAL, KIND } = optionEnv;

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = (2n ** 63n) - 1n;

// the suite's FORMATS, BITS and DEPTHS
const FORMATS = [{ name: 'plain', value: 0 }, { name: 'json', value: 1 }];
const BITS    = [{ name: 'a', value: 1 }, { name: 'b', value: 2 },
                 { name: 'c', value: 4 }];
const DEPTHS  = [{ name: 'unbounded', value: 0 }];

/*
tripRows
  The suite's D_TESTS_TRIP_ROWS: a row of every kind, for writing what
loads back.
*/
function tripRows()
{
    return [
        optionEnv.rowBool('flag', 0),
        optionEnv.rowInt('count', 0),
        { kind: KIND.INT, name: 'depth', integer: 1, minimum: 1, maximum: 9,
          names: DEPTHS },
        optionEnv.rowReal('ratio', 0.0),
        optionEnv.rowText('title', null),
        optionEnv.rowChoice('format', FORMATS, 0),
        optionEnv.rowFlags('bits', BITS, 0)
    ];
}

/*
tripFrames
  Two frames over the trip's rows: one to write from, one to load into.
*/
function tripFrames()
{
    const from = optionEnv.init();
    const to   = optionEnv.init();

    assert.equal(optionEnv.declareAll(from, tripRows()).isOk, true);
    assert.equal(optionEnv.declareAll(to, tripRows()).isOk, true);

    return { from: from, to: to };
}

/*
trip
  The suite's d_tests_option_env_trip: writes a variable's value as
formatQuoted does, loads the statement into a second frame as a script,
and says whether the same value came back: a real's bits, a text's bytes,
the others' integers.
*/
function trip(
    _from,
    _to,
    _var
)
{
    const name   = optionEnv.varAt(_from, _var).name;
    const quoted = optionEnv.formatQuoted(_from, GLOBAL, _var);

    if ( (quoted === null) ||
         !optionEnv.load(_to, name + '=' + quoted).isOk )
    {
        return false;
    }

    const want = optionEnv.get(_from, GLOBAL, _var).got;
    const got  = optionEnv.get(_to, GLOBAL, _var).got;

    switch (want.kind)
    {
        case KIND.REAL:
            return Object.is(want.real, got.real);

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
    const past  = optionEnv.DEPTH_MAX + 1;
    const chain = [];

    for (let i = 0; i <= past; ++i)
    {
        chain.push(optionEnv.init({ bindings: 1, vars: 0, text: 0 }));

        // a chain as deep as allowed; the last frame is left a root
        if ( (i > 0) &&
             (i < past) )
        {
            optionEnv.setParent(chain[i], chain[i - 1]);
        }
    }

    assert.equal(chain[optionEnv.DEPTH_MAX].depth, optionEnv.DEPTH_MAX);
    assert.deepEqual(optionEnv.setParent(chain[past],
                                         chain[optionEnv.DEPTH_MAX]),
                     fail(STATUS.CAPACITY));
    assert.equal(optionEnv.root(chain[optionEnv.DEPTH_MAX]), chain[0]);
});

test('round_trip: writing what loads back, every kind', () =>
{
    const REALS        = [0.1, -2.5e-300, 1e300, 123456789.123456789, -0.0];
    const { from, to } = tripFrames();

    optionEnv.setBool(from, GLOBAL, 0, true);
    assert.ok(trip(from, to, 0));

    optionEnv.setInt(from, GLOBAL, 1, INT64_MIN);
    assert.ok(trip(from, to, 1));
    assert.equal(optionEnv.int(to, GLOBAL, 1), INT64_MIN);
    optionEnv.setInt(from, GLOBAL, 1, INT64_MAX);
    assert.ok(trip(from, to, 1));
    assert.equal(optionEnv.int(to, GLOBAL, 1), INT64_MAX);

    optionEnv.put(from, 'depth=unbounded');
    assert.ok(trip(from, to, 2));
    assert.equal(optionEnv.int(to, GLOBAL, 2), 0);
    optionEnv.setInt(from, GLOBAL, 2, 7);
    assert.ok(trip(from, to, 2));
    assert.equal(optionEnv.int(to, GLOBAL, 2), 7);

    for (const real of REALS)
    {
        optionEnv.setReal(from, GLOBAL, 3, real);
        assert.ok(trip(from, to, 3), String(real));
    }

    optionEnv.put(from, 'format=json');
    assert.ok(trip(from, to, 5));
    optionEnv.put(from, 'bits=a|b');
    assert.ok(trip(from, to, 6));
    assert.equal(optionEnv.int(to, GLOBAL, 6), 3);
    optionEnv.setInt(from, GLOBAL, 6, 0);
    assert.ok(trip(from, to, 6));
    assert.equal(optionEnv.int(to, GLOBAL, 6), 0);
});

test('round_trip_text: text loads back as it was, whatever it holds', () =>
{
    const TEXTS = [
        'plain',       'two words',  ' leading',      'trailing ', '',
        'a # b',       'a; b',       'say "hi"',      'back\\slash',
        'line\nbreak', 'tab\tin',    '\x01ctl',       'über',
        '=equals',     '-dash'
    ];
    const { from, to } = tripFrames();

    for (const text of TEXTS)
    {
        optionEnv.setText(from, GLOBAL, 4, text);
        assert.ok(trip(from, to, 4), JSON.stringify(text));
        assert.equal(optionEnv.text(to, GLOBAL, 4), text);
    }

    // quotes only where they are needed
    optionEnv.setText(from, GLOBAL, 4, 'two words');
    assert.equal(optionEnv.formatQuoted(from, GLOBAL, 4), 'two words');
    optionEnv.setText(from, GLOBAL, 4, 'say "hi"\n');
    assert.equal(optionEnv.formatQuoted(from, GLOBAL, 4),
                 '"say \\"hi\\"\\n"');
    assert.equal(optionEnv.format(from, GLOBAL, 4), 'say "hi"\n');

    // a null text writes nothing; space around '='
    optionEnv.unset(from, GLOBAL, 4);
    assert.equal(optionEnv.formatQuoted(from, GLOBAL, 4), '');
    assert.equal(optionEnv.load(to, 'title = " padded "').isOk, true);
    assert.equal(optionEnv.text(to, GLOBAL, 4), ' padded ');
    assert.equal(optionEnv.load(to, 'count = 5').isOk, true);
    assert.equal(optionEnv.int(to, GLOBAL, 1), 5n);
});

test('hot_path: a cache reads again only when the chain has moved', () =>
{
    const root  = optionEnv.init();
    const child = optionEnv.init();
    const cache = {};

    optionEnv.declare(root, optionEnv.rowIntRange('key_width', 24, 1,
                                                  120));
    optionEnv.setParent(child, root);

    assert.equal(optionEnv.cached(child, GLOBAL, 0, cache).integer, 24);

    // the cache is what is read, until the generation moves
    cache.value.integer = 999;
    assert.equal(optionEnv.cached(child, GLOBAL, 0, cache).integer, 999);
    optionEnv.setInt(root, GLOBAL, 0, 31);
    assert.equal(optionEnv.cached(child, GLOBAL, 0, cache).integer, 31);
    optionEnv.setInt(child, GLOBAL, 0, 32);
    assert.equal(optionEnv.cached(child, GLOBAL, 0, cache).integer, 32);
    assert.equal(optionEnv.cached(child, GLOBAL, 99, {}).kind, 0);
    assert.equal(optionEnv.cached(child, GLOBAL, 0, null), null);
});

test('past the suite: every double of the sweep loads back to the bit',
     () =>
{
    const lines = readFileSync(new URL('../../generated/reals.txt',
                                       import.meta.url), 'latin1')
                      .split('\n').filter((_line) => (_line.length !== 0) &&
                                                     !_line.startsWith('#'));
    const { from, to } = tripFrames();
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

        optionEnv.setReal(from, GLOBAL, 3, real);
        assert.ok(trip(from, to, 3), line);
        ++count;
    }

    assert.ok(count > 6000, String(count));
});
