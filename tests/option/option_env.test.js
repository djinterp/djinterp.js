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
*                                                            revised: 2026.11.16
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATUS, fail, ok, resultStatus, statusIsMechanical,
         statusMessage, statusName }
    from '../../src/option/option_common.js';
import * as optionEnv from '../../src/option/option_env.js';
import { generated } from '../support/fixture.js';

const { GLOBAL, KIND, SOURCE } = optionEnv;

/*
frameOf
  A frame with rows declared; the ids they were given.
*/
function frameOf(
    _rows
)
{
    const env = optionEnv.init();
    const ids = _rows.map((_row) =>
    {
        const declared = optionEnv.declare(env, _row);

        assert.equal(declared.isOk, true, _row.name);

        return declared.value;
    });

    return { env: env, ids: ids };
}

test('results and statuses', () =>
{
    assert.deepEqual(ok(3), { isOk: true, value: 3 });
    assert.deepEqual(fail(STATUS.KEY_ABSENT),
                     { isOk: false, error: STATUS.KEY_ABSENT });
    assert.equal(resultStatus(ok(3)), STATUS.OK);
    assert.equal(resultStatus(fail(STATUS.CONFLICT)), STATUS.CONFLICT);
    assert.equal(statusName(STATUS.POLICY_REJECTED), 'POLICY_REJECTED');
    assert.equal(statusName(12345), 'UNKNOWN');
    assert.equal(statusMessage(STATUS.OK), 'the operation completed');
    assert.equal(statusIsMechanical(STATUS.CAPACITY), true);
    assert.equal(statusIsMechanical(STATUS.INVALID_ARGUMENT), false);
});

test('an integer is a number where the row\'s values are exact', () =>
{
    const names = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }];
    const { env, ids } = frameOf([
        optionEnv.rowBool('flag', true),
        optionEnv.rowIntRange('ranged', 5, 0, 100),
        optionEnv.rowInt('any', 5),
        optionEnv.rowChoice('choice', names, 1),
        optionEnv.rowFlags('flags', names, 3),
        optionEnv.rowIntRange('edge', 0, -Number.MAX_SAFE_INTEGER,
                              Number.MAX_SAFE_INTEGER),
        optionEnv.rowIntRange('past', 0, 0, 2n ** 53n),
        optionEnv.rowFlags('wide', [{ name: 'top', value: 2n ** 62n }], 0),
        optionEnv.rowFlags('signed', [{ name: 's', value: -(2n ** 63n) }],
                           0),
        optionEnv.rowChoice('big', [{ name: 'z', value: 0 },
                                    { name: 'max',
                                      value: (2n ** 63n) - 1n }], 0)
    ]);
    const typed = (_i) => typeof optionEnv.get(env, GLOBAL, ids[_i]).got
                                          .integer;

    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(typed),
                     ['number', 'number', 'bigint', 'number', 'number',
                      'number', 'bigint', 'bigint', 'bigint', 'bigint']);

    // the same through the reader for one kind
    assert.equal(optionEnv.int(env, GLOBAL, ids[1]), 5);
    assert.equal(optionEnv.int(env, GLOBAL, ids[2]), 5n);

    // a 64-bit value arrives whole
    assert.equal(optionEnv.assign(env, 'any', '9223372036854775807').isOk,
                 true);
    assert.equal(optionEnv.int(env, GLOBAL, ids[2]), 9223372036854775807n);
    assert.equal(optionEnv.assign(env, 'big', 'max').isOk, true);
    assert.equal(optionEnv.get(env, GLOBAL, ids[9]).got.integer,
                 9223372036854775807n);
    assert.equal(optionEnv.format(env, GLOBAL, ids[9]), 'max');
});

test('an integer is taken as a number, a bigint or a decimal string', () =>
{
    const { env, ids } = frameOf([optionEnv.rowInt('any', 0)]);

    assert.equal(optionEnv.setInt(env, GLOBAL, ids[0], 7).isOk, true);
    assert.equal(optionEnv.int(env, GLOBAL, ids[0]), 7n);
    assert.equal(optionEnv.setInt(env, GLOBAL, ids[0], -(2n ** 63n)).isOk,
                 true);
    assert.equal(optionEnv.int(env, GLOBAL, ids[0]), -(2n ** 63n));
    assert.equal(optionEnv.setValue(env, GLOBAL, ids[0], SOURCE.FILE,
                                    { kind: KIND.INT, integer: '12' })
                          .isOk, true);

    // what is not an exact 64-bit integer is a misuse, and throws
    assert.throws(() => optionEnv.setInt(env, GLOBAL, ids[0], 1.5),
                  TypeError);
    assert.throws(() => optionEnv.setInt(env, GLOBAL, ids[0], 2 ** 53),
                  TypeError);
    assert.throws(() => optionEnv.setInt(env, GLOBAL, ids[0], '0x10'),
                  TypeError);
    assert.throws(() => optionEnv.setInt(env, GLOBAL, ids[0], 2n ** 63n),
                  RangeError);
    assert.throws(() => optionEnv.setReal(env, GLOBAL, ids[0], '1'),
                  TypeError);
});

test('a refusal is a status; only a misuse throws', () =>
{
    const { env, ids } = frameOf([
        optionEnv.rowIntRange('width', 240, 100, 600)
    ]);

    // expected failures, each the reference's status
    assert.deepEqual(optionEnv.assign(env, 'width', '700'),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnv.assign(env, 'nothing', '1'),
                     fail(STATUS.KEY_ABSENT));
    assert.deepEqual(optionEnv.setBool(env, GLOBAL, ids[0], true),
                     fail(STATUS.VALUE_TYPE_MISMATCH));
    assert.deepEqual(optionEnv.get(null, GLOBAL, 0),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnv.get({}, GLOBAL, 0),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnv.declare(env, null),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnv.declare(env, { name: 'x', kind: 99 }),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnv.declare(env, optionEnv.rowBool('width',
                                                              false)),
                     fail(STATUS.KEY_DUPLICATE));

    // a wrong type is a misuse
    assert.throws(() => optionEnv.put(env, 7), TypeError);
    assert.throws(() => optionEnv.find(env, {}), TypeError);
    assert.throws(() => optionEnv.declare(env, { name: 7, kind: 1 }),
                  TypeError);
    assert.throws(() => optionEnv.declare(env, 'row'), TypeError);
    assert.throws(() => optionEnv.init({ vars: -1 }), TypeError);
    assert.throws(() => optionEnv.init({ text: 1.5 }), TypeError);
});

test('the row makers are the reference\'s macros', () =>
{
    const names = [{ name: 'a', value: 1 }];

    assert.deepEqual(optionEnv.rowBool('b', 1, 'h'),
                     { kind: KIND.BOOL, name: 'b', integer: 1, help: 'h' });
    assert.deepEqual(optionEnv.rowInt('i', 3),
                     { kind: KIND.INT, name: 'i', integer: 3, help: null });
    assert.deepEqual(optionEnv.rowIntRange('r', 3, 1, 9, 'h'),
                     { kind: KIND.INT, name: 'r', integer: 3, minimum: 1,
                       maximum: 9, help: 'h' });
    assert.deepEqual(optionEnv.rowReal('x', 0.5),
                     { kind: KIND.REAL, name: 'x', real: 0.5, help: null });
    assert.deepEqual(optionEnv.rowText('t', null),
                     { kind: KIND.TEXT, name: 't', text: null, help: null });
    assert.deepEqual(optionEnv.rowChoice('c', names, 1),
                     { kind: KIND.CHOICE, name: 'c', names: names,
                       integer: 1, help: null });
    assert.deepEqual(optionEnv.rowFlags('f', names, 0),
                     { kind: KIND.FLAGS, name: 'f', names: names,
                       integer: 0, help: null });
    assert.equal(optionEnv.refuses(SOURCE.ENVIRONMENT), 8);
    assert.equal(optionEnv.kindName(KIND.FLAGS), 'flags');
    assert.equal(optionEnv.kindName(0), 'unknown');
    assert.equal(optionEnv.sourceName(SOURCE.COMMAND_LINE), 'command line');
    assert.equal(optionEnv.sourceName(6), 'unknown');
});

test('a row is kept, and handed back as it was given', () =>
{
    const row = optionEnv.rowText('title', 'café', 'a text');
    const { env, ids } = frameOf([row]);

    assert.equal(optionEnv.varAt(env, ids[0]), row);
    assert.equal(optionEnv.varFrame(env, ids[0]), env);
    assert.equal(optionEnv.varAt(env, 99), null);
    assert.equal(optionEnv.text(env, GLOBAL, ids[0]), 'café');
    assert.equal(optionEnv.name(env), null);
    assert.equal(optionEnv.setName(env, 'page').isOk, true);
    assert.equal(optionEnv.name(env), 'page');
    assert.equal(optionEnv.name(null), null);
});

test('the readers for one kind', () =>
{
    const { env, ids } = frameOf([
        optionEnv.rowBool('flag', false),
        optionEnv.rowReal('ratio', 0.5),
        optionEnv.rowText('title', null),
        optionEnv.rowChoice('style', [{ name: 'plain', value: 0 },
                                      { name: 'json', value: 1 }], 0)
    ]);

    assert.equal(optionEnv.bool(env, GLOBAL, ids[0]), false);
    assert.equal(optionEnv.setBool(env, GLOBAL, ids[0], true).isOk, true);
    assert.equal(optionEnv.bool(env, GLOBAL, ids[0]), true);
    assert.equal(optionEnv.bool(env, GLOBAL, ids[1]), false);

    assert.equal(optionEnv.real(env, GLOBAL, ids[1]), 0.5);
    assert.equal(optionEnv.setReal(env, GLOBAL, ids[1], 2.5).isOk, true);
    assert.equal(optionEnv.real(env, GLOBAL, ids[1]), 2.5);
    assert.equal(optionEnv.real(env, GLOBAL, ids[0]), 0);
    assert.equal(optionEnv.int(env, GLOBAL, ids[1]), 0);

    assert.equal(optionEnv.text(env, GLOBAL, ids[2]), null);
    assert.equal(optionEnv.setText(env, GLOBAL, ids[2], 'here').isOk,
                 true);
    assert.equal(optionEnv.text(env, GLOBAL, ids[2]), 'here');
    assert.equal(optionEnv.setText(env, GLOBAL, ids[2], null).isOk, true);
    assert.equal(optionEnv.text(env, GLOBAL, ids[2]), null);
    assert.equal(optionEnv.format(env, GLOBAL, ids[2]), '');
    assert.equal(optionEnv.text(env, GLOBAL, ids[3]), 'plain');
    assert.equal(optionEnv.text(env, GLOBAL, ids[0]), null);

    assert.equal(optionEnv.source(env, GLOBAL, ids[0]), SOURCE.PROGRAM);
    assert.equal(optionEnv.source(env, GLOBAL, ids[3]), SOURCE.DEFAULT);
    assert.equal(optionEnv.source(env, GLOBAL, 99), -1);
    assert.equal(optionEnv.format(env, GLOBAL, 99), null);
    assert.equal(optionEnv.formatQuoted(env, GLOBAL, 99), null);
    assert.deepEqual(optionEnv.layers(env, GLOBAL, 99),
                     { count: -1, layers: [] });
});

test('any NaN is "nan": the one place the port leaves the reference',
     () =>
{
    const { env, ids } = frameOf([optionEnv.rowReal('ratio', 0.5)]);

    // the reference, built with glibc, writes this one back as "-nan";
    // the port keeps no sign for a NaN (the owner's ruling 4, 2026-11-16)
    assert.equal(optionEnv.assign(env, 'ratio', '-nan').isOk, true);
    assert.ok(Number.isNaN(optionEnv.real(env, GLOBAL, ids[0])));
    assert.equal(optionEnv.format(env, GLOBAL, ids[0]), 'nan');
    assert.equal(optionEnv.formatQuoted(env, GLOBAL, ids[0]), 'nan');
    optionEnv.setReal(env, GLOBAL, ids[0], -NaN);
    assert.equal(optionEnv.format(env, GLOBAL, ids[0]), 'nan');
});

test('the environment is a Map, an object or a function', () =>
{
    const rows = [optionEnv.rowIntRange('width', 240, 100, 600),
                  optionEnv.rowBool('color', true)];
    const want = (_environment) =>
    {
        const { env, ids } = frameOf(rows);

        assert.deepEqual(optionEnv.import(env, 'APP_', _environment), ok(2));
        assert.equal(optionEnv.int(env, GLOBAL, ids[0]), 300);
        assert.equal(optionEnv.bool(env, GLOBAL, ids[1]), false);
        assert.equal(optionEnv.source(env, GLOBAL, ids[0]),
                     SOURCE.ENVIRONMENT);
    };

    want(new Map([['APP_WIDTH', '300'], ['APP_COLOR', 'no']]));
    want({ APP_WIDTH: '300', APP_COLOR: 'no' });
    want((_name) => ({ APP_WIDTH: '300', APP_COLOR: 'no' })[_name]);

    // nothing an object inherits is a variable; no environment is empty
    const { env } = frameOf([optionEnv.rowText('constructor', null)]);

    assert.deepEqual(optionEnv.import(env, '', {}), ok(0));
    assert.deepEqual(optionEnv.import_(env, null, null), ok(0));
    assert.equal(optionEnv.import, optionEnv.import_);
});

test('a script\'s refusal is reported as an index into the script',
     () =>
{
    const { env } = frameOf([optionEnv.rowText('title', null),
                             optionEnv.rowIntRange('width', 240, 100,
                                                   600)]);
    const script  = 'title = €€; width = 5';
    const loaded  = optionEnv.load(env, script);

    // the reference, counting bytes, says 16 for the same script: each
    // euro sign is three bytes there and one unit here (ruling 3)
    assert.equal(loaded.error, STATUS.INVALID_ARGUMENT);
    assert.equal(loaded.errorOffset, 12);
    assert.equal(script.indexOf('width'), 12);
    assert.equal(optionEnv.statementEnd(script, 0), script.indexOf(';'));

    // a character outside the first plane is two units
    const far = optionEnv.load(env, 'title = \u{1F600}; width = 5');

    assert.equal(far.errorOffset, 12);
    assert.equal(optionEnv.text(env, GLOBAL, 0), '\u{1F600}');
    assert.equal(optionEnv.format(env, GLOBAL, 0).length, 2);
});

test('cached reads again only when the generation has moved', () =>
{
    const { env, ids } = frameOf([optionEnv.rowIntRange('width', 240,
                                                         100, 600)]);
    const cache        = {};
    const first        = optionEnv.cached(env, GLOBAL, ids[0], cache);

    assert.equal(first.integer, 240);
    assert.equal(optionEnv.cached(env, GLOBAL, ids[0], cache), first);
    optionEnv.assign(env, 'width', '300');
    assert.notEqual(optionEnv.cached(env, GLOBAL, ids[0], cache), first);
    assert.equal(cache.value.integer, 300);
    assert.equal(optionEnv.cached(env, GLOBAL, 99, {}).kind, 0);
    assert.equal(optionEnv.cached(env, GLOBAL, ids[0], null), null);
});

test('ids carry their frame\'s depth', () =>
{
    const root  = optionEnv.init();
    const child = optionEnv.init();

    optionEnv.declare(root, optionEnv.rowBool('a', false));
    optionEnv.declare(child, optionEnv.rowBool('b', false));
    assert.equal(optionEnv.setParent(child, root).isOk, true);

    const b = optionEnv.find(child, 'b').value;

    assert.equal(optionEnv.idDepth(b), 1);
    assert.equal(optionEnv.idIndex(b), 0);
    assert.equal(optionEnv.idDepth(optionEnv.find(child, 'a').value), 0);
    assert.equal(optionEnv.varId(child, 5), optionEnv.NONE);
    assert.equal(optionEnv.root(child), root);
    assert.equal(optionEnv.root(null), null);
    assert.equal(optionEnv.setParent(child, undefined).isOk, true);
    assert.equal(optionEnv.root(child), child);
});

test('a frame from its record is full where the reference\'s is', () =>
{
    // the fixture's smallest frame: two bindings, three variables, and
    // sixteen units of text, as tools/rows_json.c wrote it
    const record = generated('fixture.json').frames
                       .find((_frame) => (_frame.name === 'tiny'));
    const made   = optionEnv.fromRecord(record);

    assert.equal(made.isOk, true);
    assert.equal(optionEnv.name(made.env), 'tiny');
    assert.equal(optionEnv.varCount(made.env), record.rows.length);
    assert.deepEqual(optionEnv.declare(made.env,
                                       optionEnv.rowBool('over', false)),
                     fail(STATUS.CAPACITY));
    assert.equal(optionEnv.assign(made.env, 't', 'fits').isOk, true);
    assert.deepEqual(optionEnv.setTextCopy(made.env, GLOBAL, 0,
                                           'x'.repeat(record.text)),
                     fail(STATUS.BUFFER_TOO_SMALL));

    // what the reference refuses of a record is the answer; no record is
    // a misuse
    assert.deepEqual(optionEnv.fromRecord({ name: 'not a name' }),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.equal(optionEnv.fromRecord({}).isOk, true);
    assert.throws(() => optionEnv.fromRecord(null), TypeError);
});
