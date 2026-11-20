/*******************************************************************************
* djinterp.js [event]                                   event_registry_common.js
*
*   Delivery. A registry is a table and what is done over it: `dispatch`
* folds a key's word over one occurrence, in the order its letters were
* bound, stopping at the first that consumes; `run` does so for each of a
* row of occurrences; `compile` copies out a key's enabled letters as a
* WORD that runs with no further lookup.
*   A dispatch folds the word as it stood when the dispatch began. A letter
* a handler binds meanwhile joins the next occurrence; a letter a handler
* unbinds meanwhile is still reached by the dispatch that began before the
* unbind, and by no dispatch nested inside it that began after; the mask
* is read as each letter is reached. The suite's snapshot cases hold these
* down, as the reference's do.
*   The reference's `run` is handed a block of equal-sized occurrences; here
* it is handed an array.
*   reference: inc/djinterp/c/event/event_registry_common.h and
*              src/djinterp/c/event/event_registry_common.c, at d20c0b23
*
*
* path:      /src/event/event_registry_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The registry
    1.  registry_init, registry_dispose
    2.  registry_bind, registry_unbind
2.  Dispatch
    1.  dispatch_result_empty
    2.  registry_dispatch
3.  Run
    1.  registry_run
4.  The fused word
    1.  registry_compile
    2.  word_run_one, word_drive
*/

import { HANDLER_ID_NULL, STATUS, VERDICT, verdict_is_consumed }
    from './event_common.js';
import { step_fold } from './event_handler_common.js';
import * as event_table from './event_table_common.js';


//==============================================================================
// 1.  THE REGISTRY
//==============================================================================

/**
 * A registry: `table` is its table, read with event_table_common.js.
 *
 * @typedef {{table: event_table}} event_registry
 */

// 1.1
/**
 * A registry with no letters.
 *
 * @param {object} [_room]  the table's room, as `table_init` takes it.
 * @returns {event_registry}
 */
export function registry_init(
    _room = {}
)
{
    return { table: event_table.table_init(_room) };
}

/**
 * Unbinds every letter and ends the registry.
 *
 * @param {?event_registry} _registry  the registry.
 */
export function registry_dispose(
    _registry
)
{
    if (_registry)
    {
        event_table.table_dispose(_registry.table);
    }

    return;
}

// 1.2
/**
 * Appends a letter to a key's word: `table_bind` on the registry's table.
 *
 * @param {?event_registry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {event_step}      _step      the handler.
 * @param {?function(*): void} [_state_free=null]  called with the step's
 *        state when the letter is unbound.
 * @returns {{status: number, id: number}}
 */
export function registry_bind(
    _registry,
    _key,
    _step,
    _state_free = null
)
{
    if (!_registry)
    {
        return { status: STATUS.ERR_NULL, id: HANDLER_ID_NULL };
    }

    return event_table.table_bind(_registry.table, _key, _step, _state_free);
}

/**
 * Unbinds the letter of an id: `table_unbind` on the registry's table.
 *
 * @param {?event_registry} _registry  the registry.
 * @param {number}          _id        the letter's id.
 * @returns {number}
 */
export function registry_unbind(
    _registry,
    _id
)
{
    if (!_registry)
    {
        return STATUS.ERR_NULL;
    }

    return event_table.table_unbind(_registry.table, _id);
}


//==============================================================================
// 2.  DISPATCH
//==============================================================================

// 2.1
/**
 * The result of dispatching the empty word: nothing invoked, passed.
 *
 * @returns {{invoked: number, outcome: number}}
 */
export function dispatch_result_empty()
{
    return { invoked: 0, outcome: VERDICT.PASS };
}

// 2.2
/**
 * Folds a key's word over one occurrence: each enabled letter in the
 * order it was bound, until one consumes.
 *
 * @param {?event_registry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {*}               _payload   the occurrence's payload, handed to
 *        each handler; the handlers may change what it refers to.
 * @returns {{invoked: number, outcome: number}} how many handlers were
 *          invoked, and the word's VERDICT.
 */
export function registry_dispatch(
    _registry,
    _key,
    _payload
)
{
    const result = dispatch_result_empty();

    if ( !_registry ||
         !event_table.internal.ready(_registry.table) )
    {
        return result;
    }

    const table     = _registry.table;
    const bound     = table.next_id - 1;
    const outermost = event_table.internal.dispatch_begin(table);

    // by position: a handler's binding appends, and a letter unbound
    // meanwhile keeps its place until the outermost dispatch ends
    for (let i = 0; i < table.entries.length; ++i)
    {
        const entry = table.entries[i];

        // the word began before this letter was bound: it waits its turn
        if ( (entry.key !== _key) ||
             (entry.id > bound) )
        {
            continue;
        }

        // a letter unbound before this dispatch began is not in its word;
        // only the dispatch that was running when it was unbound folds it
        if ( entry.zombie &&
             !outermost )
        {
            continue;
        }

        // the mask is read as the letter is reached
        if (!entry.enabled)
        {
            continue;
        }

        const folded = step_fold([entry.step], _payload);

        result.invoked += folded.invoked;

        if (verdict_is_consumed(folded.verdict))
        {
            result.outcome = VERDICT.CONSUME;

            break;
        }
    }

    event_table.internal.dispatch_end(table, outermost);

    return result;
}


//==============================================================================
// 3.  RUN
//==============================================================================

// 3.1
/**
 * Dispatches a row of occurrences of one key, in order. The word is found
 * for each one, so an edit a handler makes is seen by the next.
 *
 * @param {?event_registry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {Array<*>}        _payloads  each occurrence's payload.
 * @returns {{occurrences: number, handlers_invoked: number,
 *            consumed_count: number}} how many occurrences were
 *          dispatched, how many handlers were invoked over them all, and
 *          how many occurrences were consumed.
 */
export function registry_run(
    _registry,
    _key,
    _payloads
)
{
    const run = { occurrences: 0, handlers_invoked: 0, consumed_count: 0 };

    if (!_registry)
    {
        return run;
    }

    for (const payload of (_payloads ?? []))
    {
        const result = registry_dispatch(_registry, _key, payload);

        ++run.occurrences;
        run.handlers_invoked += result.invoked;

        if (verdict_is_consumed(result.outcome))
        {
            ++run.consumed_count;
        }
    }

    return run;
}


//==============================================================================
// 4.  THE FUSED WORD
//==============================================================================

/**
 * A key's enabled letters, copied out in word order: a word that runs with
 * no lookup, and does not see the registry change after it was made.
 *
 * @typedef {{key: bigint, steps: Array<event_step>}} event_word
 */

// 4.1
/**
 * Copies out a key's enabled letters as a word.
 *
 * @param {?event_registry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @returns {{status: number, word: ?event_word}} OK and the word; ERR_NULL
 *          and no word for no registry.
 */
export function registry_compile(
    _registry,
    _key
)
{
    if (!_registry)
    {
        return { status: STATUS.ERR_NULL, word: null };
    }

    return {
        status: STATUS.OK,
        word:   {
            key:   _key,
            steps: event_table.table_word(_registry.table, _key)
                              .filter((_entry) => _entry.enabled)
                              .map((_entry) => _entry.step)
        }
    };
}

// 4.2
/**
 * Folds a word over one occurrence.
 *
 * @param {?event_word} _word     the word; none is the empty word.
 * @param {*}           _payload  the payload.
 * @returns {{verdict: number, invoked: number}}
 */
export function word_run_one(
    _word,
    _payload
)
{
    return step_fold(_word ? _word.steps : [], _payload);
}

/**
 * Folds a word over a row of occurrences, in order.
 *
 * @param {?event_word} _word      the word.
 * @param {Array<*>}    _payloads  each occurrence's payload.
 * @returns {{occurrences: number, consumed_count: number}}
 */
export function word_drive(
    _word,
    _payloads
)
{
    const drive = { occurrences: 0, consumed_count: 0 };

    if (!_word)
    {
        return drive;
    }

    for (const payload of (_payloads ?? []))
    {
        ++drive.occurrences;

        if (verdict_is_consumed(word_run_one(_word, payload).verdict))
        {
            ++drive.consumed_count;
        }
    }

    return drive;
}
