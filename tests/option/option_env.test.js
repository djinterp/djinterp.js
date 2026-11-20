/*******************************************************************************
* djinterp.js [tests]                                         option_env.test.js
*
*   What of the option machine is the port's own and no transcript can
* hold: the types a value is handed out in, what is a throw and what is a
* status, the row makers, the environment's three shapes, and the readers
* a transcript reaches only through `get`.
*   What the machine binds, refuses and writes is in the session
* transcripts (tests/session.test.js), against the reference.
*
*
* path:      /tests/option/option_env.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATUS, fail, ok, result_status, status_is_mechanical,
         status_message, status_name }
    from '../../src/option/option_common.js';
import * as option_env from '../../src/option/option_env.js';
import { string_index } from '../../src/text/utf8.js';

const { GLOBAL, KIND, SOURCE } = option_env;

/*
frame_of
  A frame with rows declared; the ids they were given.
*/
function frame_of(
    _rows
)
{
    const env = option_env.init();
    const ids = _rows.map((_row) =>
    {
        const declared = option_env.declare(env, _row);

        assert.equal(declared.is_ok, true, _row.name);

        return declared.value;
    });

    return { env: env, ids: ids };
}

test('results and statuses', () =>
{
    assert.deepEqual(ok(3), { is_ok: true, value: 3 });
    assert.deepEqual(fail(STATUS.KEY_ABSENT),
                     { is_ok: false, error: STATUS.KEY_ABSENT });
    assert.equal(result_status(ok(3)), STATUS.OK);
    assert.equal(result_status(fail(STATUS.CONFLICT)), STATUS.CONFLICT);
    assert.equal(status_name(STATUS.POLICY_REJECTED), 'POLICY_REJECTED');
    assert.equal(status_name(12345), 'UNKNOWN');
    assert.equal(status_message(STATUS.OK), 'the operation completed');
    assert.equal(status_is_mechanical(STATUS.CAPACITY), true);
    assert.equal(status_is_mechanical(STATUS.INVALID_ARGUMENT), false);
});

test('an integer is a number where the row\'s values are exact', () =>
{
    const names = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }];
    const { env, ids } = frame_of([
        option_env.row_bool('flag', true),
        option_env.row_int_range('ranged', 5, 0, 100),
        option_env.row_int('any', 5),
        option_env.row_choice('choice', names, 1),
        option_env.row_flags('flags', names, 3),
        option_env.row_int_range('edge', 0, -Number.MAX_SAFE_INTEGER,
                                 Number.MAX_SAFE_INTEGER),
        option_env.row_int_range('past', 0, 0, 2n ** 53n),
        option_env.row_flags('wide', [{ name: 'top', value: 2n ** 62n }], 0),
        option_env.row_flags('signed', [{ name: 's', value: -(2n ** 63n) }],
                             0),
        option_env.row_choice('big', [{ name: 'z', value: 0 },
                                      { name: 'max',
                                        value: (2n ** 63n) - 1n }], 0)
    ]);
    const typed = (_i) => typeof option_env.get(env, GLOBAL, ids[_i]).got
                                           .integer;

    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(typed),
                     ['number', 'number', 'bigint', 'number', 'number',
                      'number', 'bigint', 'bigint', 'bigint', 'bigint']);

    // the same through the reader for one kind
    assert.equal(option_env.int(env, GLOBAL, ids[1]), 5);
    assert.equal(option_env.int(env, GLOBAL, ids[2]), 5n);

    // a 64-bit value arrives whole
    assert.equal(option_env.assign(env, 'any', '9223372036854775807').is_ok,
                 true);
    assert.equal(option_env.int(env, GLOBAL, ids[2]), 9223372036854775807n);
    assert.equal(option_env.assign(env, 'big', 'max').is_ok, true);
    assert.equal(option_env.get(env, GLOBAL, ids[9]).got.integer,
                 9223372036854775807n);
    assert.equal(option_env.format(env, GLOBAL, ids[9]), 'max');
});

test('an integer is taken as a number, a bigint or a decimal string', () =>
{
    const { env, ids } = frame_of([option_env.row_int('any', 0)]);

    assert.equal(option_env.set_int(env, GLOBAL, ids[0], 7).is_ok, true);
    assert.equal(option_env.int(env, GLOBAL, ids[0]), 7n);
    assert.equal(option_env.set_int(env, GLOBAL, ids[0], -(2n ** 63n)).is_ok,
                 true);
    assert.equal(option_env.int(env, GLOBAL, ids[0]), -(2n ** 63n));
    assert.equal(option_env.set_value(env, GLOBAL, ids[0], SOURCE.FILE,
                                      { kind: KIND.INT, integer: '12' })
                           .is_ok, true);

    // what is not an exact 64-bit integer is a misuse, and throws
    assert.throws(() => option_env.set_int(env, GLOBAL, ids[0], 1.5),
                  TypeError);
    assert.throws(() => option_env.set_int(env, GLOBAL, ids[0], 2 ** 53),
                  TypeError);
    assert.throws(() => option_env.set_int(env, GLOBAL, ids[0], '0x10'),
                  TypeError);
    assert.throws(() => option_env.set_int(env, GLOBAL, ids[0], 2n ** 63n),
                  RangeError);
    assert.throws(() => option_env.set_real(env, GLOBAL, ids[0], '1'),
                  TypeError);
});

test('a refusal is a status; only a misuse throws', () =>
{
    const { env, ids } = frame_of([
        option_env.row_int_range('width', 240, 100, 600)
    ]);

    // expected failures, each the reference's status
    assert.deepEqual(option_env.assign(env, 'width', '700'),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env.assign(env, 'nothing', '1'),
                     fail(STATUS.KEY_ABSENT));
    assert.deepEqual(option_env.set_bool(env, GLOBAL, ids[0], true),
                     fail(STATUS.VALUE_TYPE_MISMATCH));
    assert.deepEqual(option_env.get(null, GLOBAL, 0),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env.get({}, GLOBAL, 0),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env.declare(env, null),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env.declare(env, { name: 'x', kind: 99 }),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env.declare(env, option_env.row_bool('width',
                                                                 false)),
                     fail(STATUS.KEY_DUPLICATE));

    // a wrong type is a misuse
    assert.throws(() => option_env.put(env, 7), TypeError);
    assert.throws(() => option_env.find(env, {}), TypeError);
    assert.throws(() => option_env.declare(env, { name: 7, kind: 1 }),
                  TypeError);
    assert.throws(() => option_env.declare(env, 'row'), TypeError);
    assert.throws(() => option_env.init({ vars: -1 }), TypeError);
    assert.throws(() => option_env.init({ text: 1.5 }), TypeError);
});

test('the row makers are the reference\'s macros', () =>
{
    const names = [{ name: 'a', value: 1 }];

    assert.deepEqual(option_env.row_bool('b', 1, 'h'),
                     { kind: KIND.BOOL, name: 'b', integer: 1, help: 'h' });
    assert.deepEqual(option_env.row_int('i', 3),
                     { kind: KIND.INT, name: 'i', integer: 3, help: null });
    assert.deepEqual(option_env.row_int_range('r', 3, 1, 9, 'h'),
                     { kind: KIND.INT, name: 'r', integer: 3, minimum: 1,
                       maximum: 9, help: 'h' });
    assert.deepEqual(option_env.row_real('x', 0.5),
                     { kind: KIND.REAL, name: 'x', real: 0.5, help: null });
    assert.deepEqual(option_env.row_text('t', null),
                     { kind: KIND.TEXT, name: 't', text: null, help: null });
    assert.deepEqual(option_env.row_choice('c', names, 1),
                     { kind: KIND.CHOICE, name: 'c', names: names,
                       integer: 1, help: null });
    assert.deepEqual(option_env.row_flags('f', names, 0),
                     { kind: KIND.FLAGS, name: 'f', names: names,
                       integer: 0, help: null });
    assert.equal(option_env.refuses(SOURCE.ENVIRONMENT), 8);
    assert.equal(option_env.kind_name(KIND.FLAGS), 'flags');
    assert.equal(option_env.kind_name(0), 'unknown');
    assert.equal(option_env.source_name(SOURCE.COMMAND_LINE), 'command line');
    assert.equal(option_env.source_name(6), 'unknown');
});

test('a row is kept, and handed back as it was given', () =>
{
    const row = option_env.row_text('title', 'café', 'a text');
    const { env, ids } = frame_of([row]);

    assert.equal(option_env.var_at(env, ids[0]), row);
    assert.equal(option_env.var_frame(env, ids[0]), env);
    assert.equal(option_env.var_at(env, 99), null);
    assert.equal(option_env.text(env, GLOBAL, ids[0]), 'café');
    assert.equal(option_env.name(env), null);
    assert.equal(option_env.set_name(env, 'page').is_ok, true);
    assert.equal(option_env.name(env), 'page');
    assert.equal(option_env.name(null), null);
});

test('the readers for one kind', () =>
{
    const { env, ids } = frame_of([
        option_env.row_bool('flag', false),
        option_env.row_real('ratio', 0.5),
        option_env.row_text('title', null),
        option_env.row_choice('style', [{ name: 'plain', value: 0 },
                                        { name: 'json', value: 1 }], 0)
    ]);

    assert.equal(option_env.bool(env, GLOBAL, ids[0]), false);
    assert.equal(option_env.set_bool(env, GLOBAL, ids[0], true).is_ok, true);
    assert.equal(option_env.bool(env, GLOBAL, ids[0]), true);
    assert.equal(option_env.bool(env, GLOBAL, ids[1]), false);

    assert.equal(option_env.real(env, GLOBAL, ids[1]), 0.5);
    assert.equal(option_env.set_real(env, GLOBAL, ids[1], 2.5).is_ok, true);
    assert.equal(option_env.real(env, GLOBAL, ids[1]), 2.5);
    assert.equal(option_env.real(env, GLOBAL, ids[0]), 0);
    assert.equal(option_env.int(env, GLOBAL, ids[1]), 0);

    assert.equal(option_env.text(env, GLOBAL, ids[2]), null);
    assert.equal(option_env.set_text(env, GLOBAL, ids[2], 'here').is_ok,
                 true);
    assert.equal(option_env.text(env, GLOBAL, ids[2]), 'here');
    assert.equal(option_env.set_text(env, GLOBAL, ids[2], null).is_ok, true);
    assert.equal(option_env.text(env, GLOBAL, ids[2]), null);
    assert.equal(option_env.format(env, GLOBAL, ids[2]), '');
    assert.equal(option_env.text(env, GLOBAL, ids[3]), 'plain');
    assert.equal(option_env.text(env, GLOBAL, ids[0]), null);

    assert.equal(option_env.source(env, GLOBAL, ids[0]), SOURCE.PROGRAM);
    assert.equal(option_env.source(env, GLOBAL, ids[3]), SOURCE.DEFAULT);
    assert.equal(option_env.source(env, GLOBAL, 99), -1);
    assert.equal(option_env.format(env, GLOBAL, 99), null);
    assert.equal(option_env.format_quoted(env, GLOBAL, 99), null);
    assert.deepEqual(option_env.layers(env, GLOBAL, 99),
                     { count: -1, layers: [] });
});

test('any NaN is "nan": the one place the port leaves the reference',
     () =>
{
    const { env, ids } = frame_of([option_env.row_real('ratio', 0.5)]);

    // the reference, built with glibc, writes this one back as "-nan";
    // the port keeps no sign for a NaN (the owner's ruling 4, 2026-11-16)
    assert.equal(option_env.assign(env, 'ratio', '-nan').is_ok, true);
    assert.ok(Number.isNaN(option_env.real(env, GLOBAL, ids[0])));
    assert.equal(option_env.format(env, GLOBAL, ids[0]), 'nan');
    assert.equal(option_env.format_quoted(env, GLOBAL, ids[0]), 'nan');
    option_env.set_real(env, GLOBAL, ids[0], -NaN);
    assert.equal(option_env.format(env, GLOBAL, ids[0]), 'nan');
});

test('the environment is a Map, an object or a function', () =>
{
    const rows = [option_env.row_int_range('width', 240, 100, 600),
                  option_env.row_bool('color', true)];
    const want = (_environment) =>
    {
        const { env, ids } = frame_of(rows);

        assert.deepEqual(option_env.import(env, 'APP_', _environment), ok(2));
        assert.equal(option_env.int(env, GLOBAL, ids[0]), 300);
        assert.equal(option_env.bool(env, GLOBAL, ids[1]), false);
        assert.equal(option_env.source(env, GLOBAL, ids[0]),
                     SOURCE.ENVIRONMENT);
    };

    want(new Map([['APP_WIDTH', '300'], ['APP_COLOR', 'no']]));
    want({ APP_WIDTH: '300', APP_COLOR: 'no' });
    want((_name) => ({ APP_WIDTH: '300', APP_COLOR: 'no' })[_name]);

    // nothing an object inherits is a variable; no environment is empty
    const { env } = frame_of([option_env.row_text('constructor', null)]);

    assert.deepEqual(option_env.import(env, '', {}), ok(0));
    assert.deepEqual(option_env.import_(env, null, null), ok(0));
    assert.equal(option_env.import, option_env.import_);
});

test('a script\'s refusal is reported in bytes, as the reference\'s is',
     () =>
{
    const { env } = frame_of([option_env.row_text('title', null),
                              option_env.row_int_range('width', 240, 100,
                                                       600)]);
    const script  = 'title = €€; width = 5';
    const loaded  = option_env.load(env, script);

    // two characters of three bytes each: the refused statement starts 12
    // into the string and 16 into its bytes
    assert.equal(loaded.error, STATUS.INVALID_ARGUMENT);
    assert.equal(loaded.error_offset, 16);
    assert.equal(script.indexOf('width'), 12);
    assert.equal(string_index(script, loaded.error_offset), 12);
    assert.equal(option_env.statement_end(script, 0), 14);
});

test('cached reads again only when the generation has moved', () =>
{
    const { env, ids } = frame_of([option_env.row_int_range('width', 240,
                                                             100, 600)]);
    const cache        = {};
    const first        = option_env.cached(env, GLOBAL, ids[0], cache);

    assert.equal(first.integer, 240);
    assert.equal(option_env.cached(env, GLOBAL, ids[0], cache), first);
    option_env.assign(env, 'width', '300');
    assert.notEqual(option_env.cached(env, GLOBAL, ids[0], cache), first);
    assert.equal(cache.value.integer, 300);
    assert.equal(option_env.cached(env, GLOBAL, 99, {}).kind, 0);
    assert.equal(option_env.cached(env, GLOBAL, ids[0], null), null);
});

test('ids carry their frame\'s depth', () =>
{
    const root  = option_env.init();
    const child = option_env.init();

    option_env.declare(root, option_env.row_bool('a', false));
    option_env.declare(child, option_env.row_bool('b', false));
    assert.equal(option_env.set_parent(child, root).is_ok, true);

    const b = option_env.find(child, 'b').value;

    assert.equal(option_env.id_depth(b), 1);
    assert.equal(option_env.id_index(b), 0);
    assert.equal(option_env.id_depth(option_env.find(child, 'a').value), 0);
    assert.equal(option_env.var_id(child, 5), option_env.NONE);
    assert.equal(option_env.root(child), root);
    assert.equal(option_env.root(null), null);
    assert.equal(option_env.set_parent(child, undefined).is_ok, true);
    assert.equal(option_env.root(child), child);
});
