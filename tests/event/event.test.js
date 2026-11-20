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
    return event.step_make(() =>
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
        assert.equal(event.key_of_name(name), BigInt(key), name);
    }

    assert.equal(event.key_of_name(null), event.KEY_NONE);
    assert.equal(event.key_of_name('a\0b'), event.key_of_name('a'));
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
    assert.equal(event.step_is_skip(event.step_skip()), true);
    assert.equal(event.step_is_skip(null), true);
    assert.equal(event.step_invoke(event.step_skip(), null), PASS);
    assert.equal(event.step_invoke(null, null), PASS);

    // left zero: seq(consume, b) is consume and b is NOT invoked
    assert.equal(logged(() => assert.equal(
        event.step_invoke(event.step_seq(tagged('a', CONSUME), tagged('b')),
                          null), CONSUME)), 'a');

    // both stages run, in order, when the first passes
    assert.equal(logged(() => assert.equal(
        event.step_invoke(event.step_seq(tagged('a'), tagged('b', CONSUME)),
                          null), CONSUME)), 'ab');

    // skip is a unit on both sides, for either verdict
    for (const verdict of [PASS, CONSUME])
    {
        const skip = event.step_skip();

        assert.equal(logged(() => assert.equal(
            event.step_invoke(event.step_seq(skip, tagged('x', verdict)),
                              null), verdict)), 'x');
        assert.equal(logged(() => assert.equal(
            event.step_invoke(event.step_seq(tagged('x', verdict), skip),
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
        const left_log  = logged(() =>
        {
            left = event.step_invoke(
                       event.step_seq(event.step_seq(a, b), c), null);
        });
        const right_log = logged(() =>
        {
            right = event.step_invoke(
                        event.step_seq(a, event.step_seq(b, c)), null);
        });

        assert.equal(left, right, 'verdicts ' + bits);
        assert.equal(left_log, right_log, 'effects ' + bits);
    }
});

test('monoid: fold, and the callback adapter', () =>
{
    // fold: stops at the first consume; the unit is neither called nor
    // counted
    let folded;

    assert.equal(logged(() =>
    {
        folded = event.step_fold([tagged('a'), event.step_skip(),
                                  tagged('b', CONSUME), tagged('c')], null);
    }), 'ab');
    assert.deepEqual(folded, { verdict: CONSUME, invoked: 2 });

    // inserting the unit changes neither the verdict nor the count
    assert.deepEqual(event.step_fold([tagged('a'), tagged('b')], null),
                     event.step_fold([event.step_skip(), tagged('a'),
                                      event.step_skip(), tagged('b'),
                                      event.step_skip()], null));

    // a missing array folds as the empty word, and the count is written
    assert.deepEqual(event.step_fold(null, null),
                     { verdict: PASS, invoked: 0 });

    // the adapter calls back with its own context, never the payload
    const seen    = [];
    const context = { mine: true };
    const adapted = event.step_from_callback((_c) => seen.push(_c), context);

    assert.equal(event.step_invoke(adapted, { payload: true }), PASS);
    assert.deepEqual(seen, [context]);

    // no callback is the unit's verdict, with no call
    assert.equal(event.step_invoke(event.step_from_callback(null), 1), PASS);
});

test('table: words, ids, the full table, unbind and its hook', () =>
{
    const table = event.table_init({ capacity: 4 });
    const k1    = event.key_of_name('one');
    const k2    = event.key_of_name('two');
    const freed = [];
    const state = { mine: 1 };

    // two interleaved words; ids count up from 1 in bind order
    const a = event.table_bind(table, k1, tagged('a'));
    const b = event.table_bind(table, k2, tagged('b'));
    const c = event.table_bind(table, k1, event.step_make(() => PASS, state),
                               (_s) => freed.push(_s));
    const d = event.table_bind(table, k2, tagged('d'));

    assert.deepEqual([a, b, c, d].map((_r) => _r.status),
                     [STATUS.OK, STATUS.OK, STATUS.OK, STATUS.OK]);
    assert.deepEqual([a.id, b.id, c.id, d.id], [1, 2, 3, 4]);

    // a full table refuses rather than grows
    assert.deepEqual(event.table_bind(table, k1, tagged('e')),
                     { status: STATUS.ERR_CAPACITY,
                       id: event.HANDLER_ID_NULL });
    assert.equal(event.table_count(table), 4);

    // word access skips the other key
    assert.deepEqual(event.table_word(table, k1).map((_e) => _e.id), [1, 3]);
    assert.deepEqual(event.table_word(table, k2).map((_e) => _e.id), [2, 4]);
    assert.equal(event.table_key_count(table), 2);

    // unbind runs the hook once, and the id is gone for good
    assert.equal(event.table_unbind(table, c.id), STATUS.OK);
    assert.deepEqual(freed, [state]);
    assert.equal(event.table_unbind(table, c.id), STATUS.ERR_NOT_FOUND);
    assert.equal(event.table_contains(table, c.id), false);
    assert.equal(event.table_find(table, c.id), null);
    assert.equal(event.table_unbind(table, event.HANDLER_ID_NULL),
                 STATUS.ERR_NOT_FOUND);
    assert.equal(event.table_unbind(null, 1), STATUS.ERR_NULL);

    // a letter bound after an unbind ends its word, with a fresh id
    const e = event.table_bind(table, k1, tagged('e'));

    assert.equal(e.id, 5);
    assert.deepEqual(event.table_word(table, k1).map((_e) => _e.id), [1, 5]);

    // global iteration is ascending id
    const ids = [];

    assert.equal(event.table_for_each(table, (_e) => ids.push(_e.id)), 4);
    assert.deepEqual(ids, [1, 2, 4, 5]);

    // a visitor returning false stops the walk after that entry
    assert.equal(event.table_for_each(table, (_e) => (_e.id < 2)), 2);

    // one word, in word order
    const word = [];

    assert.equal(event.table_for_each_key(table, k2,
                                          (_e) => word.push(_e.id)), 2);
    assert.deepEqual(word, [2, 4]);
});

test('table: the mask\'s three-way results; clear_key, clear, dispose', () =>
{
    const table = event.table_init();
    const k1    = event.key_of_name('one');
    const k2    = event.key_of_name('two');
    let   freed = 0;
    const hook  = () => ++freed;
    const a     = event.table_bind(table, k1, tagged('a'), hook).id;
    const b     = event.table_bind(table, k1, tagged('b'), hook).id;
    const c     = event.table_bind(table, k2, tagged('c'), hook).id;

    // the mask's three-way results, with the count following the mask
    assert.equal(event.table_enabled_count(table), 3);
    assert.equal(event.table_enable(table, a), STATUS.ERR_STATE);
    assert.equal(event.table_disable(table, a), STATUS.OK);
    assert.equal(event.table_disable(table, a), STATUS.ERR_STATE);
    assert.equal(event.table_is_enabled(table, a), false);
    assert.equal(event.table_contains(table, a), true);
    assert.equal(event.table_enabled_count(table), 2);
    assert.equal(event.table_count(table), 3);
    assert.equal(event.table_enable(table, a), STATUS.OK);
    assert.equal(event.table_enabled_count(table), 3);
    assert.equal(event.table_enable(table, 99), STATUS.ERR_NOT_FOUND);
    assert.equal(event.table_disable(table, 99), STATUS.ERR_NOT_FOUND);

    // a masked letter that is unbound takes its mask's count with it
    assert.equal(event.table_disable(table, b), STATUS.OK);

    // clear_key drops one word, running its hooks
    assert.equal(event.table_clear_key(table, k1), 2);
    assert.equal(freed, 2);
    assert.equal(event.table_count(table), 1);
    assert.equal(event.table_enabled_count(table), 1);
    assert.equal(event.table_has_entries_for(table, k1), false);
    assert.equal(event.table_has_entries_for(table, k2), true);

    // clear runs every remaining hook once; handler ids are never reused
    event.table_clear(table);
    assert.equal(freed, 3);
    assert.equal(event.table_count(table), 0);
    assert.equal(event.table_contains(table, c), false);
    assert.equal(event.table_bind(table, k1, tagged('d')).id, 4);

    // dispose twice, and on no table, is safe
    event.table_dispose(table);
    event.table_dispose(table);
    event.table_dispose(null);

    // a disposed table refuses a bind and reports empty everywhere
    assert.equal(event.table_bind(table, k1, tagged('x')).status,
                 STATUS.ERR_STATE);
    assert.equal(event.table_bind(null, k1, tagged('x')).status,
                 STATUS.ERR_NULL);
    assert.equal(event.table_count(table), 0);
    assert.equal(event.table_key_count(table), 0);
    assert.deepEqual(event.table_word(table, k1), []);
    assert.equal(event.table_for_each(table, () => true), 0);
    assert.equal(event.table_unbind(table, 1), STATUS.ERR_NOT_FOUND);
    assert.equal(event.table_enable(table, 1), STATUS.ERR_NOT_FOUND);
});

test('merge: this table\'s first, fresh ids, the mask travels', () =>
{
    const k     = event.key_of_name('k');
    const j     = event.key_of_name('j');
    const table = event.table_init();
    const other = event.table_init();
    let   freed = 0;

    event.table_bind(table, k, tagged('a'));
    event.table_bind(other, k, tagged('b'), () => ++freed);

    const masked = event.table_bind(other, j, tagged('c')).id;

    event.table_bind(other, k, tagged('d'));
    event.table_disable(other, masked);

    // this table's letters first, then the other's; fresh ids; mask travels
    assert.deepEqual(event.table_merge(table, other),
                     { status: STATUS.OK, merged: 3 });
    assert.deepEqual(event.table_word(table, k).map((_e) => _e.id),
                     [1, 2, 4]);
    assert.deepEqual(event.table_word(table, j).map((_e) => _e.enabled),
                     [false]);
    assert.equal(event.table_count(table), 4);
    assert.equal(event.table_enabled_count(table), 3);

    // merged letters borrow their state: unbinding one runs no hook
    assert.equal(event.table_unbind(table, 2), STATUS.OK);
    assert.equal(freed, 0);

    // the other table is unchanged
    assert.equal(event.table_count(other), 3);
    assert.equal(event.table_enabled_count(other), 2);

    // the empty table is the identity, on either side
    const empty = event.table_init();

    assert.deepEqual(event.table_merge(table, empty),
                     { status: STATUS.OK, merged: 0 });
    assert.equal(event.table_count(table), 3);
    assert.deepEqual(event.table_merge(empty, other),
                     { status: STATUS.OK, merged: 3 });
    assert.deepEqual(event.table_word(empty, k).map((_e) => _e.id), [1, 3]);

    // merging a table into itself doubles each word, once
    assert.deepEqual(event.table_merge(other, other),
                     { status: STATUS.OK, merged: 3 });
    assert.equal(event.table_count_for(other, k), 4);
    assert.equal(event.table_count_for(other, j), 2);

    // a full table stops part-way and says how far it got
    const small = event.table_init({ capacity: 2 });

    assert.deepEqual(event.table_merge(small, empty),
                     { status: STATUS.ERR_CAPACITY, merged: 2 });
    assert.equal(event.table_count(small), 2);

    // both tables are required
    assert.deepEqual(event.table_merge(null, other),
                     { status: STATUS.ERR_NULL, merged: 0 });
});

test('dispatch: the empty word, word order, consume, the mask law', () =>
{
    const r = event.registry_init();
    const k = event.key_of_name('k');

    // the empty word: no invocation, pass, and not an error
    assert.deepEqual(event.registry_dispatch(r, k, null),
                     { invoked: 0, outcome: PASS });
    assert.deepEqual(event.registry_dispatch(null, k, null),
                     event.dispatch_result_empty());

    // word order, and the first consume cuts off the rest
    event.registry_bind(r, k, tagged('a'));

    const b = event.registry_bind(r, k, tagged('b', CONSUME)).id;

    event.registry_bind(r, k, tagged('c'));
    event.registry_bind(r, event.key_of_name('other'), tagged('z'));

    let result;

    assert.equal(logged(() =>
    {
        result = event.registry_dispatch(r, k, null);
    }), 'ab');
    assert.deepEqual(result, { invoked: 2, outcome: CONSUME });

    // a masked letter is skip: the word after it is reached
    event.table_disable(r.table, b);
    assert.equal(logged(() =>
    {
        result = event.registry_dispatch(r, k, null);
    }), 'ac');
    assert.deepEqual(result, { invoked: 2, outcome: PASS });

    // the mask law: masking a letter of a passing word keeps its verdict
    const p     = event.registry_init();
    const ids   = ['x', 'y', 'z'].map((_l) =>
                      event.registry_bind(p, k, tagged(_l)).id);

    for (const id of ids)
    {
        event.table_disable(p.table, id);
        assert.equal(event.registry_dispatch(p, k, null).outcome, PASS);
        event.table_enable(p.table, id);
    }

    // the payload reaches every letter, untouched by the core
    const q       = event.registry_init();
    const payload = { hits: 0 };
    const hit     = event.step_make((_payload) =>
    {
        ++_payload.hits;

        return PASS;
    });

    event.registry_bind(q, k, hit);
    event.registry_bind(q, k, hit);
    event.registry_dispatch(q, k, payload);
    assert.equal(payload.hits, 2);

    // a unit bound as a letter is not invoked and not counted
    event.registry_bind(q, k, event.step_skip());
    assert.equal(event.registry_dispatch(q, k, payload).invoked, 2);
});

test('snapshot: a dispatch folds the word as it stood when it began', () =>
{
    const k  = event.key_of_name('snap');
    const kk = event.key_of_name('outer');
    const kj = event.key_of_name('inner');
    let   r;
    let   freed;
    let   freed_seen;
    let   target;
    let   gone;

    // a step that logs, then acts on the registry
    const acting = (_letter, _act) => event.step_make(() =>
    {
        log += _letter;
        freed_seen = freed;
        _act();

        return PASS;
    });

    // a letter bound mid-dispatch joins the NEXT occurrence
    r = event.registry_init();

    let bind = true;

    event.registry_bind(r, k, acting('a', () =>
    {
        if (bind)
        {
            event.registry_bind(r, k, tagged('n'));
        }
    }));
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'a');
    assert.equal(event.table_count_for(r.table, k), 2);
    bind = false;
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'an');

    // a later letter unbound mid-dispatch still runs, with its state alive;
    // it is gone from every query at once, and its hook runs afterwards
    r     = event.registry_init();
    freed = 0;

    let unbind = true;

    event.registry_bind(r, k, acting('u', () =>
    {
        if (unbind)
        {
            event.registry_unbind(r, target);
            gone = !event.table_contains(r.table, target);
        }
    }));

    let l_saw = -1;

    target = event.registry_bind(r, k, event.step_make(() =>
    {
        log   += 'l';
        l_saw  = freed;

        return PASS;
    }), () => ++freed).id;

    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'ul');
    assert.equal(gone, true);
    assert.equal(l_saw, 0);
    assert.equal(freed, 1);
    assert.equal(event.table_count_for(r.table, k), 1);
    unbind = false;
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'u');

    // a one-shot letter unbinds itself: it runs once, its hook after
    r     = event.registry_init();
    freed = 0;

    const once = event.registry_bind(r, k, acting('o', () =>
    {
        event.registry_unbind(r, once);
    }), () => ++freed).id;

    event.registry_bind(r, k, tagged('p'));
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'op');
    assert.equal(freed, 1);
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'p');

    // a clear mid-dispatch leaves the running word intact
    r     = event.registry_init();
    freed = 0;
    event.registry_bind(r, k, acting('c', () =>
    {
        event.table_clear(r.table);
    }));

    let d_saw = -1;

    event.registry_bind(r, k, event.step_make(() =>
    {
        log   += 'd';
        d_saw  = freed;

        return PASS;
    }), () => ++freed);
    event.registry_bind(r, k, tagged('e'));
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'cde');
    assert.equal(event.table_count(r.table), 0);
    assert.equal(freed, 1);
    assert.equal(d_saw, 0);

    // after the reap the table is whole again
    assert.equal(event.registry_bind(r, k, tagged('e')).status, STATUS.OK);
    assert.equal(event.table_count(r.table), 1);

    // a dispose mid-dispatch completes the word, then disposes
    r     = event.registry_init();
    freed = 0;
    event.registry_bind(r, k, acting('x', () =>
    {
        event.registry_dispose(r);
    }));
    event.registry_bind(r, k, tagged('y'), () => ++freed);
    assert.equal(logged(() => event.registry_dispatch(r, k, null)), 'xy');
    assert.equal(freed, 1);
    assert.equal(event.registry_bind(r, k, tagged('z')).status,
                 STATUS.ERR_STATE);

    // nested: a letter unbound inside a nested dispatch is still folded by
    // the outer one, which began before the unbind
    r     = event.registry_init();
    freed = 0;
    event.registry_bind(r, kk, acting('f', () =>
    {
        event.registry_dispatch(r, kj, null);
    }));

    let g_saw = -1;

    target = event.registry_bind(r, kk, event.step_make(() =>
    {
        log   += 'g';
        g_saw  = freed;

        return PASS;
    }), () => ++freed).id;
    event.registry_bind(r, kj, acting('h', () =>
    {
        event.registry_unbind(r, target);
    }));
    assert.equal(logged(() => event.registry_dispatch(r, kk, null)), 'fhg');
    assert.equal(g_saw, 0);
    assert.equal(freed, 1);
    assert.equal(event.table_count_for(r.table, kk), 1);

    // nested: a letter unbound BEFORE a nested dispatch began is not in it
    r     = event.registry_init();
    freed = 0;
    event.registry_bind(r, kk, acting('u', () =>
    {
        event.registry_unbind(r, target);
    }));
    event.registry_bind(r, kk, acting('f', () =>
    {
        event.registry_dispatch(r, kj, null);
    }));
    target = event.registry_bind(r, kj, tagged('w'), () => ++freed).id;
    assert.equal(logged(() => event.registry_dispatch(r, kk, null)), 'uf');
    assert.equal(freed, 1);
});

test('run: each occurrence dispatched in place, in order', () =>
{
    const r = event.registry_init();
    const k = event.key_of_name('k');

    event.registry_bind(r, k, event.step_make((_payload) =>
    {
        _payload.seen = true;
        log += _payload.letter;

        return _payload.stop ? CONSUME : PASS;
    }));
    event.registry_bind(r, k, tagged('+'));

    const payloads = [{ letter: 'a' }, { letter: 'b', stop: true },
                      { letter: 'c' }];
    let   run;

    assert.equal(logged(() =>
    {
        run = event.registry_run(r, k, payloads);
    }), 'a+bc+');
    assert.deepEqual(run, { occurrences: 3, handlers_invoked: 5,
                            consumed_count: 1 });
    assert.ok(payloads.every((_p) => _p.seen));

    // no registry: nothing runs
    assert.deepEqual(event.registry_run(null, k, payloads),
                     { occurrences: 0, handlers_invoked: 0,
                       consumed_count: 0 });
});

test('the fused word: a snapshot, and the coherence law', () =>
{
    const r = event.registry_init();
    const k = event.key_of_name('k');
    const stops = (_payload) =>
    {
        log += _payload.letter;

        return _payload.stop ? CONSUME : PASS;
    };

    event.registry_bind(r, k, tagged('p'));

    const masked = event.registry_bind(r, k, tagged('m')).id;

    event.registry_bind(r, k, event.step_make(stops));
    event.registry_bind(r, k, tagged('q'));
    event.table_disable(r.table, masked);

    // the snapshot is the enabled letters in word order
    const compiled = event.registry_compile(r, k);

    assert.equal(compiled.status, STATUS.OK);
    assert.equal(compiled.word.steps.length, 3);
    assert.equal(compiled.word.key, k);

    // COHERENCE LAW: run and drive agree on a registry held fixed -- in
    // occurrences, consumes, side effects and their order
    const payloads = [{ letter: '1' }, { letter: '2', stop: true },
                      { letter: '3' }];
    let   run;
    let   drive;
    const run_log   = logged(() =>
    {
        run = event.registry_run(r, k, payloads);
    });
    const drive_log = logged(() =>
    {
        drive = event.word_drive(compiled.word, payloads);
    });

    assert.equal(drive_log, run_log);
    assert.equal(run_log, 'p1qp2p3q');
    assert.equal(drive.occurrences, run.occurrences);
    assert.equal(drive.consumed_count, run.consumed_count);

    // the fused word ignores every later edit of the registry
    event.registry_bind(r, k, tagged('z'));
    event.table_enable(r.table, masked);
    assert.equal(logged(() => event.word_run_one(compiled.word,
                                                 { letter: '4' })), 'p4q');
    assert.equal(logged(() => event.registry_dispatch(r, k,
                                                      { letter: '4' })),
                 'pm4qz');

    // an empty word, and no word
    assert.deepEqual(event.registry_compile(r, event.key_of_name('none'))
                          .word.steps, []);
    assert.deepEqual(event.word_run_one(null, null),
                     { verdict: PASS, invoked: 0 });
    assert.deepEqual(event.word_drive(null, payloads),
                     { occurrences: 0, consumed_count: 0 });
    assert.equal(event.registry_compile(null, k).status, STATUS.ERR_NULL);
});

test('queue: FIFO, the deferral coherence law, the copy at enqueue', () =>
{
    const d = event.dispatcher_init({ queue: 3 });
    const k = event.key_of_name('k');

    event.dispatcher_bind(d, k, event.step_make((_payload) =>
    {
        log += (_payload === undefined) ? '-' : _payload.letter;

        return ( (_payload !== undefined) &&
                 _payload.stop ) ? CONSUME : PASS;
    }));
    event.dispatcher_bind(d, k, tagged('+'));

    // FIFO: occurrences arrive in the order they were queued
    for (const letter of ['a', 'b', 'c'])
    {
        assert.equal(event.dispatcher_queue(d, k, { letter: letter }),
                     STATUS.OK);
    }

    // enqueue refuses when the queue is full, and enqueues nothing
    assert.equal(event.dispatcher_queue(d, k, { letter: 'x' }),
                 STATUS.ERR_CAPACITY);
    assert.equal(event.dispatcher_pending(d), 3);

    // peek leaves the oldest where it is
    assert.equal(event.queue_peek(d.queue).payload.letter, 'a');
    assert.equal(event.queue_peek(d.queue).key, k);

    let processed;

    assert.equal(logged(() =>
    {
        processed = event.dispatcher_process(d, 2);
    }), 'a+b+');
    assert.deepEqual(processed, {
        processed: 2,
        result:    { occurrences: 2, handlers_invoked: 4, consumed_count: 0 }
    });
    assert.equal(event.dispatcher_pending(d), 1);
    assert.equal(logged(() => event.dispatcher_process_all(d)), 'c+');
    assert.equal(event.queue_is_empty(d.queue), true);
    assert.equal(event.queue_peek(d.queue), null);

    // DEFERRAL COHERENCE: fire(d, k, a) == queue(d, k, a); process(d, 1)
    for (const payload of [{ letter: 'p' }, { letter: 's', stop: true }])
    {
        let   fired;
        let   deferred;
        const fire_log  = logged(() =>
        {
            fired = event.dispatcher_fire(d, k, payload);
        });
        const defer_log = logged(() =>
        {
            event.dispatcher_queue(d, k, payload);
            deferred = event.dispatcher_process(d, 1).result;
        });

        assert.equal(defer_log, fire_log);
        assert.equal(deferred.handlers_invoked, fired.invoked);
        assert.equal(deferred.consumed_count,
                     (fired.outcome === CONSUME) ? 1 : 0);
    }

    // the payload is copied at enqueue: later writes to it are invisible
    const mine = { letter: 'm' };

    event.dispatcher_queue(d, k, mine);
    mine.letter = 'CHANGED';
    assert.equal(logged(() => event.dispatcher_process_all(d)), 'm+');

    // an occurrence with no payload reaches handlers with none
    event.dispatcher_queue(d, k);
    assert.equal(logged(() => event.dispatcher_process_all(d)), '-+');

    // a payload that is not data cannot be copied, and is a misuse
    assert.throws(() => event.dispatcher_queue(d, k, { f: () => 1 }));

    // no queue, no dispatcher
    assert.equal(event.queue_enqueue(null, k, 1), STATUS.ERR_NULL);
    assert.equal(event.dispatcher_queue(null, k, 1), STATUS.ERR_NULL);
    assert.deepEqual(event.dispatcher_process(null).processed, 0);
});

test('queue: re-entrancy, a clear from a handler, the facade', () =>
{
    const d  = event.dispatcher_init();
    const k  = event.key_of_name('k');
    const kr = event.key_of_name('reenter');
    const kt = event.key_of_name('then');
    const kc = event.key_of_name('clear');
    let   nested = 99;

    event.dispatcher_bind(d, k, tagged('k'));
    event.dispatcher_bind(d, k, tagged('K'));

    // re-entrancy: a handler's enqueue waits for the next call, and a
    // nested process is refused
    event.dispatcher_bind(d, kr, event.step_make(() =>
    {
        log += 'r';
        event.dispatcher_queue(d, kt, 1);
        nested = event.dispatcher_process_all(d);

        return PASS;
    }));
    event.dispatcher_bind(d, kt, tagged('t'));
    event.dispatcher_queue(d, kr, 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcher_process_all(d), 1)), 'r');
    assert.equal(nested, 0);
    assert.equal(event.dispatcher_pending(d), 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcher_process_all(d), 1)), 't');

    // a clear from a handler keeps the occurrence in flight, drops the rest
    event.dispatcher_bind(d, kc, event.step_make(() =>
    {
        log += 'c';
        event.queue_clear(d.queue);
        event.dispatcher_dispose({ queue: d.queue,
                                   registry: event.registry_init() });

        return PASS;
    }));
    event.dispatcher_queue(d, kc, 1);
    event.dispatcher_queue(d, k, 1);
    event.dispatcher_queue(d, k, 1);
    assert.equal(logged(() =>
                     assert.equal(event.dispatcher_process_all(d), 1)), 'c');
    assert.equal(event.dispatcher_pending(d), 0);

    // ... and its dispose was refused: the queue still works
    assert.equal(event.dispatcher_queue(d, k, 1), STATUS.OK);
    assert.equal(event.dispatcher_process_all(d), 1);

    // counts through the facade
    assert.equal(event.dispatcher_handler_count(d), 5);
    assert.equal(event.dispatcher_enabled_count(d), 5);
    assert.equal(event.dispatcher_handler_count_for(d, k), 2);

    // the mask and the ids through the facade
    const id = event.dispatcher_bind(d, k, tagged('x')).id;

    assert.equal(event.dispatcher_contains(d, id), true);
    assert.equal(event.dispatcher_disable(d, id), STATUS.OK);
    assert.equal(event.dispatcher_is_enabled(d, id), false);
    assert.equal(event.dispatcher_disable(d, id), STATUS.ERR_STATE);
    assert.equal(event.dispatcher_enable(d, id), STATUS.OK);
    assert.equal(event.dispatcher_unbind(d, id), STATUS.OK);
    assert.equal(event.dispatcher_unbind(d, id), STATUS.ERR_NOT_FOUND);

    // merge takes the other's registry, never its queue
    const other = event.dispatcher_init();

    event.dispatcher_bind(other, k, tagged('o'));
    event.dispatcher_queue(other, k, 1);
    assert.deepEqual(event.dispatcher_merge(d, other),
                     { status: STATUS.OK, merged: 1 });
    assert.equal(event.dispatcher_pending(d), 0);
    assert.equal(event.dispatcher_pending(other), 1);
    assert.equal(logged(() => event.dispatcher_fire(d, k, 1)), 'kKo');

    // run and compile through the facade
    assert.equal(event.dispatcher_run(d, k, [1, 2]).handlers_invoked, 6);
    assert.equal(event.dispatcher_compile(d, k).word.steps.length, 3);

    // dispose ends it: nothing binds, nothing is queued
    event.dispatcher_queue(d, k, 1);
    event.dispatcher_dispose(d);
    assert.equal(event.dispatcher_pending(d), 0);
    assert.equal(event.dispatcher_bind(d, k, tagged('z')).status,
                 STATUS.ERR_STATE);
    assert.deepEqual(event.dispatcher_fire(d, k, 1),
                     event.dispatch_result_empty());
});
