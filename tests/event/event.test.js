/*******************************************************************************
* djinterp.js [tests]                                              event.test.js
*
*   The event core, by the cases of the reference's own suite
* (tests/djinterp/c/event/t_event_core.c, at dfc793c4), in its order and
* under its headings: the monoid laws, the table, merge, dispatch, the
* snapshot semantics, run, the fused word and its coherence law, and the
* queue with its deferral coherence law and re-entrancy.
*   The suite's cases about the reference's storage -- a slot reused, the
* arena grown, a rehash, the statistics, a payload's bytes in a ring --
* have nothing to be cases of here, and are left out; each case kept says
* what the reference's says.
*   A handler here logs a letter, as the suite's does, and a dispatch is
* read by the word it logged.
*
*
* path:      /tests/event/event.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as event from '../../src/event/event.js';

const { STATUS, VERDICT } = event;
const PASS    = VERDICT.PASS;
const CONSUME = VERDICT.CONSUME;

let log = '';

/*
tagged
  A step that logs a letter and gives a verdict.
*/
function tagged(
    _letter,
    _verdict = PASS
)
{
    return event.stepMake(() =>
    {
        log += _letter;

        return _verdict;
    });
}

/*
logged
  Runs something with an empty log, and gives what it logged.
*/
function logged(
    _run
)
{
    log = '';
    _run();

    return log;
}

test('keys: FNV-1a-64 over the name, as the reference computes it', () =>
{
    const data = JSON.parse(readFileSync(
        new URL('../../generated/event.json', import.meta.url), 'utf8'));

    assert.ok(data.keys.length >= 10);

    for (const { name, key } of data.keys)
    {
        assert.equal(event.keyOfName(name), BigInt(key), name);
    }

    assert.equal(event.keyOfName(null), event.KEY_NONE);
    assert.equal(event.keyOfName('a\0b'), event.keyOfName('a'));
});

test('statuses and verdicts are the reference\'s', () =>
{
    assert.deepEqual({ ...STATUS }, {
        OK: 0, ERR_NULL: -1, ERR_CAPACITY: -2, ERR_ALLOC: -3,
        ERR_NOT_FOUND: -4, ERR_KEY: -5, ERR_STATE: -6
    });
    assert.deepEqual({ ...VERDICT }, { PASS: 0, CONSUME: 1 });
});

test('monoid: the unit, the left zero, both units, associativity', () =>
{
    // the unit passes without a call, and a missing step is the unit
    assert.equal(event.stepIsSkip(event.stepSkip()), true);
    assert.equal(event.stepIsSkip(null), true);
    assert.equal(event.stepInvoke(event.stepSkip(), null), PASS);
    assert.equal(event.stepInvoke(null, null), PASS);

    // left zero: seq(consume, b) is consume and b is NOT invoked
    assert.equal(logged(() => assert.equal(
        event.stepInvoke(event.stepSeq(tagged('a', CONSUME), tagged('b')),
                         null), CONSUME)), 'a');

    // both stages run, in order, when the first passes
    assert.equal(logged(() => assert.equal(
        event.stepInvoke(event.stepSeq(tagged('a'), tagged('b', CONSUME)),
                         null), CONSUME)), 'ab');

    // skip is a unit on both sides, for either verdict
    for (const verdict of [PASS, CONSUME])
    {
        const skip = event.stepSkip();

        assert.equal(logged(() => assert.equal(
            event.stepInvoke(event.stepSeq(skip, tagged('x', verdict)),
                             null), verdict)), 'x');
        assert.equal(logged(() => assert.equal(
            event.stepInvoke(event.stepSeq(tagged('x', verdict), skip),
                             null), verdict)), 'x');
    }

    // associativity, over all eight verdict combinations
    for (let bits = 0; bits < 8; ++bits)
    {
        const v     = (_i) => (((bits >> _i) & 1) ? CONSUME : PASS);
        const make  = () => [tagged('a', v(0)), tagged('b', v(1)),
                             tagged('c', v(2))];
        const [a, b, c] = make();
        let   left;
        let   right;
        const leftLog  = logged(() =>
        {
            left = event.stepInvoke(
                       event.stepSeq(event.stepSeq(a, b), c), null);
        });
        const rightLog = logged(() =>
        {
            right = event.stepInvoke(
                        event.stepSeq(a, event.stepSeq(b, c)), null);
        });

        assert.equal(left, right, 'verdicts ' + bits);
        assert.equal(leftLog, rightLog, 'effects ' + bits);
    }
});

test('monoid: fold, and the callback adapter', () =>
{
    // fold: stops at the first consume; the unit is neither called nor
    // counted
    let folded;

    assert.equal(logged(() =>
    {
        folded = event.stepFold([tagged('a'), event.stepSkip(),
                                 tagged('b', CONSUME), tagged('c')], null);
    }), 'ab');
    assert.deepEqual(folded, { verdict: CONSUME, invoked: 2 });

    // inserting the unit changes neither the verdict nor the count
    assert.deepEqual(event.stepFold([tagged('a'), tagged('b')], null),
                     event.stepFold([event.stepSkip(), tagged('a'),
                                     event.stepSkip(), tagged('b'),
                                     event.stepSkip()], null));

    // a missing array folds as the empty word, and the count is written
    assert.deepEqual(event.stepFold(null, null),
                     { verdict: PASS, invoked: 0 });

    // the adapter calls back with its own context, never the payload
    const seen    = [];
    const context = { mine: true };
    const adapted = event.stepFromCallback((_c) => seen.push(_c), context);

    assert.equal(event.stepInvoke(adapted, { payload: true }), PASS);
    assert.deepEqual(seen, [context]);

    // no callback is the unit's verdict, with no call
    assert.equal(event.stepInvoke(event.stepFromCallback(null), 1), PASS);
});

test('table: words, ids, the full table, unbind and its hook', () =>
{
    const table = event.tableInit({ capacity: 4 });
    const k1    = event.keyOfName('one');
    const k2    = event.keyOfName('two');
    const freed = [];
    const state = { mine: 1 };

    // two interleaved words; ids count up from 1 in bind order
    const a = event.tableBind(table, k1, tagged('a'));
    const b = event.tableBind(table, k2, tagged('b'));
    const c = event.tableBind(table, k1, event.stepMake(() => PASS, state),
                              (_s) => freed.push(_s));
    const d = event.tableBind(table, k2, tagged('d'));

    assert.deepEqual([a, b, c, d].map((_r) => _r.status),
                     [STATUS.OK, STATUS.OK, STATUS.OK, STATUS.OK]);
    assert.deepEqual([a.id, b.id, c.id, d.id], [1, 2, 3, 4]);

    // a full table refuses rather than grows
    assert.deepEqual(event.tableBind(table, k1, tagged('e')),
                     { status: STATUS.ERR_CAPACITY,
                       id: event.HANDLER_ID_NULL });
    assert.equal(event.tableCount(table), 4);

    // word access skips the other key
    assert.deepEqual(event.tableWord(table, k1).map((_e) => _e.id), [1, 3]);
    assert.deepEqual(event.tableWord(table, k2).map((_e) => _e.id), [2, 4]);
    assert.equal(event.tableKeyCount(table), 2);

    // unbind runs the hook once, and the id is gone for good
    assert.equal(event.tableUnbind(table, c.id), STATUS.OK);
    assert.deepEqual(freed, [state]);
    assert.equal(event.tableUnbind(table, c.id), STATUS.ERR_NOT_FOUND);
    assert.equal(event.tableContains(table, c.id), false);
    assert.equal(event.tableFind(table, c.id), null);
    assert.equal(event.tableUnbind(table, event.HANDLER_ID_NULL),
                 STATUS.ERR_NOT_FOUND);
    assert.equal(event.tableUnbind(null, 1), STATUS.ERR_NULL);

    // a letter bound after an unbind ends its word, with a fresh id
    const e = event.tableBind(table, k1, tagged('e'));

    assert.equal(e.id, 5);
    assert.deepEqual(event.tableWord(table, k1).map((_e) => _e.id), [1, 5]);

    // global iteration is ascending id
    const ids = [];

    assert.equal(event.tableForEach(table, (_e) => ids.push(_e.id)), 4);
    assert.deepEqual(ids, [1, 2, 4, 5]);

    // a visitor returning false stops the walk after that entry
    assert.equal(event.tableForEach(table, (_e) => (_e.id < 2)), 2);

    // one word, in word order
    const word = [];

    assert.equal(event.tableForEachKey(table, k2,
                                       (_e) => word.push(_e.id)), 2);
    assert.deepEqual(word, [2, 4]);
});

test('table: the mask\'s three-way results; clear_key, clear, dispose', () =>
{
    const table = event.tableInit();
    const k1    = event.keyOfName('one');
    const k2    = event.keyOfName('two');
    let   freed = 0;
    const hook  = () => ++freed;
    const a     = event.tableBind(table, k1, tagged('a'), hook).id;
    const b     = event.tableBind(table, k1, tagged('b'), hook).id;
    const c     = event.tableBind(table, k2, tagged('c'), hook).id;

    // the mask's three-way results, with the count following the mask
    assert.equal(event.tableEnabledCount(table), 3);
    assert.equal(event.tableEnable(table, a), STATUS.ERR_STATE);
    assert.equal(event.tableDisable(table, a), STATUS.OK);
    assert.equal(event.tableDisable(table, a), STATUS.ERR_STATE);
    assert.equal(event.tableIsEnabled(table, a), false);
    assert.equal(event.tableContains(table, a), true);
    assert.equal(event.tableEnabledCount(table), 2);
    assert.equal(event.tableCount(table), 3);
    assert.equal(event.tableEnable(table, a), STATUS.OK);
    assert.equal(event.tableEnabledCount(table), 3);
    assert.equal(event.tableEnable(table, 99), STATUS.ERR_NOT_FOUND);
    assert.equal(event.tableDisable(table, 99), STATUS.ERR_NOT_FOUND);

    // a masked letter that is unbound takes its mask's count with it
    assert.equal(event.tableDisable(table, b), STATUS.OK);

    // clear_key drops one word, running its hooks
    assert.equal(event.tableClearKey(table, k1), 2);
    assert.equal(freed, 2);
    assert.equal(event.tableCount(table), 1);
    assert.equal(event.tableEnabledCount(table), 1);
    assert.equal(event.tableHasEntriesFor(table, k1), false);
    assert.equal(event.tableHasEntriesFor(table, k2), true);

    // clear runs every remaining hook once; handler ids are never reused
    event.tableClear(table);
    assert.equal(freed, 3);
    assert.equal(event.tableCount(table), 0);
    assert.equal(event.tableContains(table, c), false);
    assert.equal(event.tableBind(table, k1, tagged('d')).id, 4);

    // dispose twice, and on no table, is safe
    event.tableDispose(table);
    event.tableDispose(table);
    event.tableDispose(null);

    // a disposed table refuses a bind and reports empty everywhere
    assert.equal(event.tableBind(table, k1, tagged('x')).status,
                 STATUS.ERR_STATE);
    assert.equal(event.tableBind(null, k1, tagged('x')).status,
                 STATUS.ERR_NULL);
    assert.equal(event.tableCount(table), 0);
    assert.equal(event.tableKeyCount(table), 0);
    assert.deepEqual(event.tableWord(table, k1), []);
    assert.equal(event.tableForEach(table, () => true), 0);
    assert.equal(event.tableUnbind(table, 1), STATUS.ERR_NOT_FOUND);
    assert.equal(event.tableEnable(table, 1), STATUS.ERR_NOT_FOUND);
});

test('merge: this table\'s first, fresh ids, the mask travels', () =>
{
    const k     = event.keyOfName('k');
    const j     = event.keyOfName('j');
    const table = event.tableInit();
    const other = event.tableInit();
    let   freed = 0;

    event.tableBind(table, k, tagged('a'));
    event.tableBind(other, k, tagged('b'), () => ++freed);

    const masked = event.tableBind(other, j, tagged('c')).id;

    event.tableBind(other, k, tagged('d'));
    event.tableDisable(other, masked);

    // this table's letters first, then the other's; fresh ids; mask travels
    assert.deepEqual(event.tableMerge(table, other),
                     { status: STATUS.OK, merged: 3 });
    assert.deepEqual(event.tableWord(table, k).map((_e) => _e.id),
                     [1, 2, 4]);
    assert.deepEqual(event.tableWord(table, j).map((_e) => _e.enabled),
                     [false]);
    assert.equal(event.tableCount(table), 4);
    assert.equal(event.tableEnabledCount(table), 3);

    // merged letters borrow their state: unbinding one runs no hook
    assert.equal(event.tableUnbind(table, 2), STATUS.OK);
    assert.equal(freed, 0);

    // the other table is unchanged
    assert.equal(event.tableCount(other), 3);
    assert.equal(event.tableEnabledCount(other), 2);

    // the empty table is the identity, on either side
    const empty = event.tableInit();

    assert.deepEqual(event.tableMerge(table, empty),
                     { status: STATUS.OK, merged: 0 });
    assert.equal(event.tableCount(table), 3);
    assert.deepEqual(event.tableMerge(empty, other),
                     { status: STATUS.OK, merged: 3 });
    assert.deepEqual(event.tableWord(empty, k).map((_e) => _e.id), [1, 3]);

    // merging a table into itself doubles each word, once
    assert.deepEqual(event.tableMerge(other, other),
                     { status: STATUS.OK, merged: 3 });
    assert.equal(event.tableCountFor(other, k), 4);
    assert.equal(event.tableCountFor(other, j), 2);

    // a full table stops part-way and says how far it got
    const small = event.tableInit({ capacity: 2 });

    assert.deepEqual(event.tableMerge(small, empty),
                     { status: STATUS.ERR_CAPACITY, merged: 2 });
    assert.equal(event.tableCount(small), 2);

    // both tables are required
    assert.deepEqual(event.tableMerge(null, other),
                     { status: STATUS.ERR_NULL, merged: 0 });
});

test('dispatch: the empty word, word order, consume, the mask law', () =>
{
    const r = event.registryInit();
    const k = event.keyOfName('k');

    // the empty word: no invocation, pass, and not an error
    assert.deepEqual(event.registryDispatch(r, k, null),
                     { invoked: 0, outcome: PASS });
    assert.deepEqual(event.registryDispatch(null, k, null),
                     event.dispatchResultEmpty());

    // word order, and the first consume cuts off the rest
    event.registryBind(r, k, tagged('a'));

    const b = event.registryBind(r, k, tagged('b', CONSUME)).id;

    event.registryBind(r, k, tagged('c'));
    event.registryBind(r, event.keyOfName('other'), tagged('z'));

    let result;

    assert.equal(logged(() =>
    {
        result = event.registryDispatch(r, k, null);
    }), 'ab');
    assert.deepEqual(result, { invoked: 2, outcome: CONSUME });

    // a masked letter is skip: the word after it is reached
    event.tableDisable(r.table, b);
    assert.equal(logged(() =>
    {
        result = event.registryDispatch(r, k, null);
    }), 'ac');
    assert.deepEqual(result, { invoked: 2, outcome: PASS });

    // the mask law: masking a letter of a passing word keeps its verdict
    const p     = event.registryInit();
    const ids   = ['x', 'y', 'z'].map((_l) =>
                      event.registryBind(p, k, tagged(_l)).id);

    for (const id of ids)
    {
        event.tableDisable(p.table, id);
        assert.equal(event.registryDispatch(p, k, null).outcome, PASS);
        event.tableEnable(p.table, id);
    }

    // the payload reaches every letter, untouched by the core
    const q       = event.registryInit();
    const payload = { hits: 0 };
    const hit     = event.stepMake((_payload) =>
    {
        ++_payload.hits;

        return PASS;
    });

    event.registryBind(q, k, hit);
    event.registryBind(q, k, hit);
    event.registryDispatch(q, k, payload);
    assert.equal(payload.hits, 2);

    // a unit bound as a letter is not invoked and not counted
    event.registryBind(q, k, event.stepSkip());
    assert.equal(event.registryDispatch(q, k, payload).invoked, 2);
});

test('snapshot: a dispatch folds the word as it stood when it began', () =>
{
    const k  = event.keyOfName('snap');
    const kk = event.keyOfName('outer');
    const kj = event.keyOfName('inner');
    let   r;
    let   freed;
    let   freedSeen;
    let   target;
    let   gone;

    // a step that logs, then acts on the registry
    const acting = (_letter, _act) => event.stepMake(() =>
    {
        log += _letter;
        freedSeen = freed;
        _act();

        return PASS;
    });

    // a letter bound mid-dispatch joins the NEXT occurrence
    r = event.registryInit();

    let bind = true;

    event.registryBind(r, k, acting('a', () =>
    {
        if (bind)
        {
            event.registryBind(r, k, tagged('n'));
        }
    }));
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'a');
    assert.equal(event.tableCountFor(r.table, k), 2);
    bind = false;
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'an');

    // a later letter unbound mid-dispatch still runs, with its state alive;
    // it is gone from every query at once, and its hook runs afterwards
    r     = event.registryInit();
    freed = 0;

    let unbind = true;

    event.registryBind(r, k, acting('u', () =>
    {
        if (unbind)
        {
            event.registryUnbind(r, target);
            gone = !event.tableContains(r.table, target);
        }
    }));

    let lSaw = -1;

    target = event.registryBind(r, k, event.stepMake(() =>
    {
        log   += 'l';
        lSaw  = freed;

        return PASS;
    }), () => ++freed).id;

    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'ul');
    assert.equal(gone, true);
    assert.equal(lSaw, 0);
    assert.equal(freed, 1);
    assert.equal(event.tableCountFor(r.table, k), 1);
    unbind = false;
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'u');

    // a one-shot letter unbinds itself: it runs once, its hook after
    r     = event.registryInit();
    freed = 0;

    const once = event.registryBind(r, k, acting('o', () =>
    {
        event.registryUnbind(r, once);
    }), () => ++freed).id;

    event.registryBind(r, k, tagged('p'));
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'op');
    assert.equal(freed, 1);
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'p');

    // a clear mid-dispatch leaves the running word intact
    r     = event.registryInit();
    freed = 0;
    event.registryBind(r, k, acting('c', () =>
    {
        event.tableClear(r.table);
    }));

    let dSaw = -1;

    event.registryBind(r, k, event.stepMake(() =>
    {
        log   += 'd';
        dSaw  = freed;

        return PASS;
    }), () => ++freed);
    event.registryBind(r, k, tagged('e'));
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'cde');
    assert.equal(event.tableCount(r.table), 0);
    assert.equal(freed, 1);
    assert.equal(dSaw, 0);

    // after the reap the table is whole again
    assert.equal(event.registryBind(r, k, tagged('e')).status, STATUS.OK);
    assert.equal(event.tableCount(r.table), 1);

    // a dispose mid-dispatch completes the word, then disposes
    r     = event.registryInit();
    freed = 0;
    event.registryBind(r, k, acting('x', () =>
    {
        event.registryDispose(r);
    }));
    event.registryBind(r, k, tagged('y'), () => ++freed);
    assert.equal(logged(() => event.registryDispatch(r, k, null)), 'xy');
    assert.equal(freed, 1);
    assert.equal(event.registryBind(r, k, tagged('z')).status,
                 STATUS.ERR_STATE);

    // nested: a letter unbound inside a nested dispatch is still folded by
    // the outer one, which began before the unbind
    r     = event.registryInit();
    freed = 0;
    event.registryBind(r, kk, acting('f', () =>
    {
        event.registryDispatch(r, kj, null);
    }));

    let gSaw = -1;

    target = event.registryBind(r, kk, event.stepMake(() =>
    {
        log   += 'g';
        gSaw  = freed;

        return PASS;
    }), () => ++freed).id;
    event.registryBind(r, kj, acting('h', () =>
    {
        event.registryUnbind(r, target);
    }));
    assert.equal(logged(() => event.registryDispatch(r, kk, null)), 'fhg');
    assert.equal(gSaw, 0);
    assert.equal(freed, 1);
    assert.equal(event.tableCountFor(r.table, kk), 1);

    // nested: a letter unbound BEFORE a nested dispatch began is not in it
    r     = event.registryInit();
    freed = 0;
    event.registryBind(r, kk, acting('u', () =>
    {
        event.registryUnbind(r, target);
    }));
    event.registryBind(r, kk, acting('f', () =>
    {
        event.registryDispatch(r, kj, null);
    }));
    target = event.registryBind(r, kj, tagged('w'), () => ++freed).id;
    assert.equal(logged(() => event.registryDispatch(r, kk, null)), 'uf');
    assert.equal(freed, 1);
});

test('run: each occurrence dispatched in place, in order', () =>
{
    const r = event.registryInit();
    const k = event.keyOfName('k');

    event.registryBind(r, k, event.stepMake((_payload) =>
    {
        _payload.seen = true;
        log += _payload.letter;

        return _payload.stop ? CONSUME : PASS;
    }));
    event.registryBind(r, k, tagged('+'));

    const payloads = [{ letter: 'a' }, { letter: 'b', stop: true },
                      { letter: 'c' }];
    let   run;

    assert.equal(logged(() =>
    {
        run = event.registryRun(r, k, payloads);
    }), 'a+bc+');
    assert.deepEqual(run, { occurrences: 3, handlersInvoked: 5,
                            consumedCount: 1 });
    assert.ok(payloads.every((_p) => _p.seen));

    // no registry: nothing runs
    assert.deepEqual(event.registryRun(null, k, payloads),
                     { occurrences: 0, handlersInvoked: 0,
                       consumedCount: 0 });
});

test('the fused word: a snapshot, and the coherence law', () =>
{
    const r = event.registryInit();
    const k = event.keyOfName('k');
    const stops = (_payload) =>
    {
        log += _payload.letter;

        return _payload.stop ? CONSUME : PASS;
    };

    event.registryBind(r, k, tagged('p'));

    const masked = event.registryBind(r, k, tagged('m')).id;

    event.registryBind(r, k, event.stepMake(stops));
    event.registryBind(r, k, tagged('q'));
    event.tableDisable(r.table, masked);

    // the snapshot is the enabled letters in word order
    const compiled = event.registryCompile(r, k);

    assert.equal(compiled.status, STATUS.OK);
    assert.equal(compiled.word.steps.length, 3);
    assert.equal(compiled.word.key, k);

    // COHERENCE LAW: run and drive agree on a registry held fixed -- in
    // occurrences, consumes, side effects and their order
    const payloads = [{ letter: '1' }, { letter: '2', stop: true },
                      { letter: '3' }];
    let   run;
    let   drive;
    const runLog   = logged(() =>
    {
        run = event.registryRun(r, k, payloads);
    });
    const driveLog = logged(() =>
    {
        drive = event.wordDrive(compiled.word, payloads);
    });

    assert.equal(driveLog, runLog);
    assert.equal(runLog, 'p1qp2p3q');
    assert.equal(drive.occurrences, run.occurrences);
    assert.equal(drive.consumedCount, run.consumedCount);

    // the fused word ignores every later edit of the registry
    event.registryBind(r, k, tagged('z'));
    event.tableEnable(r.table, masked);
    assert.equal(logged(() => event.wordRunOne(compiled.word,
                                               { letter: '4' })), 'p4q');
    assert.equal(logged(() => event.registryDispatch(r, k,
                                                     { letter: '4' })),
                 'pm4qz');

    // an empty word, and no word
    assert.deepEqual(event.registryCompile(r, event.keyOfName('none'))
                          .word.steps, []);
    assert.deepEqual(event.wordRunOne(null, null),
                     { verdict: PASS, invoked: 0 });
    assert.deepEqual(event.wordDrive(null, payloads),
                     { occurrences: 0, consumedCount: 0 });
    assert.equal(event.registryCompile(null, k).status, STATUS.ERR_NULL);
});

test('queue: FIFO, the deferral coherence law, the copy at enqueue', () =>
{
    const d = event.dispatcherInit({ queue: 3 });
    const k = event.keyOfName('k');

    event.dispatcherBind(d, k, event.stepMake((_payload) =>
    {
        log += (_payload === undefined) ? '-' : _payload.letter;

        return ( (_payload !== undefined) &&
                 _payload.stop ) ? CONSUME : PASS;
    }));
    event.dispatcherBind(d, k, tagged('+'));

    // FIFO: occurrences arrive in the order they were queued
    for (const letter of ['a', 'b', 'c'])
    {
        assert.equal(event.dispatcherQueue(d, k, { letter: letter }),
                     STATUS.OK);
    }

    // enqueue refuses when the queue is full, and enqueues nothing
    assert.equal(event.dispatcherQueue(d, k, { letter: 'x' }),
                 STATUS.ERR_CAPACITY);
    assert.equal(event.dispatcherPending(d), 3);

    // peek leaves the oldest where it is
    assert.equal(event.queuePeek(d.queue).payload.letter, 'a');
    assert.equal(event.queuePeek(d.queue).key, k);

    let processed;

    assert.equal(logged(() =>
    {
        processed = event.dispatcherProcess(d, 2);
    }), 'a+b+');
    assert.deepEqual(processed, {
        processed: 2,
        result:    { occurrences: 2, handlersInvoked: 4, consumedCount: 0 }
    });
    assert.equal(event.dispatcherPending(d), 1);
    assert.equal(logged(() => event.dispatcherProcessAll(d)), 'c+');
    assert.equal(event.queueIsEmpty(d.queue), true);
    assert.equal(event.queuePeek(d.queue), null);

    // DEFERRAL COHERENCE: fire(d, k, a) == queue(d, k, a); process(d, 1)
    for (const payload of [{ letter: 'p' }, { letter: 's', stop: true }])
    {
        let   fired;
        let   deferred;
        const fireLog  = logged(() =>
        {
            fired = event.dispatcherFire(d, k, payload);
        });
        const deferLog = logged(() =>
        {
            event.dispatcherQueue(d, k, payload);
            deferred = event.dispatcherProcess(d, 1).result;
        });

        assert.equal(deferLog, fireLog);
        assert.equal(deferred.handlersInvoked, fired.invoked);
        assert.equal(deferred.consumedCount,
                     (fired.outcome === CONSUME) ? 1 : 0);
    }

    // the payload is copied at enqueue: later writes to it are invisible
    const mine = { letter: 'm' };

    event.dispatcherQueue(d, k, mine);
    mine.letter = 'CHANGED';
    assert.equal(logged(() => event.dispatcherProcessAll(d)), 'm+');

    // an occurrence with no payload reaches handlers with none
    event.dispatcherQueue(d, k);
    assert.equal(logged(() => event.dispatcherProcessAll(d)), '-+');

    // a payload that is not data cannot be copied, and is a misuse
    assert.throws(() => event.dispatcherQueue(d, k, { f: () => 1 }));

    // no queue, no dispatcher
    assert.equal(event.queueEnqueue(null, k, 1), STATUS.ERR_NULL);
    assert.equal(event.dispatcherQueue(null, k, 1), STATUS.ERR_NULL);
    assert.deepEqual(event.dispatcherProcess(null).processed, 0);
});

test('queue: re-entrancy, a clear from a handler, the facade', () =>
{
    const d  = event.dispatcherInit();
    const k  = event.keyOfName('k');
    const kr = event.keyOfName('reenter');
    const kt = event.keyOfName('then');
    const kc = event.keyOfName('clear');
    let   nested = 99;

    event.dispatcherBind(d, k, tagged('k'));
    event.dispatcherBind(d, k, tagged('K'));

    // re-entrancy: a handler's enqueue waits for the next call, and a
    // nested process is refused
    event.dispatcherBind(d, kr, event.stepMake(() =>
    {
        log += 'r';
        event.dispatcherQueue(d, kt, 1);
        nested = event.dispatcherProcessAll(d);

        return PASS;
    }));
    event.dispatcherBind(d, kt, tagged('t'));
    event.dispatcherQueue(d, kr, 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcherProcessAll(d), 1)), 'r');
    assert.equal(nested, 0);
    assert.equal(event.dispatcherPending(d), 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcherProcessAll(d), 1)), 't');

    // a clear from a handler keeps the occurrence in flight, drops the rest
    event.dispatcherBind(d, kc, event.stepMake(() =>
    {
        log += 'c';
        event.queueClear(d.queue);
        event.dispatcherDispose({ queue: d.queue,
                                  registry: event.registryInit() });

        return PASS;
    }));
    event.dispatcherQueue(d, kc, 1);
    event.dispatcherQueue(d, k, 1);
    event.dispatcherQueue(d, k, 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcherProcessAll(d), 1)), 'c');
    assert.equal(event.dispatcherPending(d), 0);

    // ... and its dispose was refused: the queue still works
    assert.equal(event.dispatcherQueue(d, k, 1), STATUS.OK);
    assert.equal(event.dispatcherProcessAll(d), 1);

    // counts through the facade
    assert.equal(event.dispatcherHandlerCount(d), 5);
    assert.equal(event.dispatcherEnabledCount(d), 5);
    assert.equal(event.dispatcherHandlerCountFor(d, k), 2);

    // the mask and the ids through the facade
    const id = event.dispatcherBind(d, k, tagged('x')).id;

    assert.equal(event.dispatcherContains(d, id), true);
    assert.equal(event.dispatcherDisable(d, id), STATUS.OK);
    assert.equal(event.dispatcherIsEnabled(d, id), false);
    assert.equal(event.dispatcherDisable(d, id), STATUS.ERR_STATE);
    assert.equal(event.dispatcherEnable(d, id), STATUS.OK);
    assert.equal(event.dispatcherUnbind(d, id), STATUS.OK);
    assert.equal(event.dispatcherUnbind(d, id), STATUS.ERR_NOT_FOUND);

    // merge takes the other's registry, never its queue
    const other = event.dispatcherInit();

    event.dispatcherBind(other, k, tagged('o'));
    event.dispatcherQueue(other, k, 1);
    assert.deepEqual(event.dispatcherMerge(d, other),
                     { status: STATUS.OK, merged: 1 });
    assert.equal(event.dispatcherPending(d), 0);
    assert.equal(event.dispatcherPending(other), 1);
    assert.equal(logged(() => event.dispatcherFire(d, k, 1)), 'kKo');

    // run and compile through the facade
    assert.equal(event.dispatcherRun(d, k, [1, 2]).handlersInvoked, 6);
    assert.equal(event.dispatcherCompile(d, k).word.steps.length, 3);

    // dispose ends it: nothing binds, nothing is queued
    event.dispatcherQueue(d, k, 1);
    event.dispatcherDispose(d);
    assert.equal(event.dispatcherPending(d), 0);
    assert.equal(event.dispatcherBind(d, k, tagged('z')).status,
                 STATUS.ERR_STATE);
    assert.deepEqual(event.dispatcherFire(d, k, 1),
                     event.dispatchResultEmpty());
});
