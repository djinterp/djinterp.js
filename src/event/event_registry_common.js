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
*              src/djinterp/c/event/event_registry_common.c, at 3eb096c9
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
    1.  registryInit, registryDispose
    2.  registryBind, registryUnbind
2.  Dispatch
    1.  dispatchResultEmpty
    2.  registryDispatch
3.  Run
    1.  registryRun
4.  The fused word
    1.  registryCompile
    2.  wordRunOne, wordDrive
*/

import { HANDLER_ID_NULL, STATUS, VERDICT, verdictIsConsumed }
    from './event_common.js';
import { stepFold } from './event_handler_common.js';
import * as eventTable from './event_table_common.js';

// the types of other modules that this one's comments name
/** @import { EventStep } from './event_handler_common.js' */
/** @import { EventTable } from './event_table_common.js' */


//==============================================================================
// 1.  THE REGISTRY
//==============================================================================

/**
 * A registry: `table` is its table, read with event_table_common.js.
 *
 * @typedef {{table: EventTable}} EventRegistry
 */

// 1.1
/**
 * A registry with no letters.
 *
 * @param {object} [_room]  the table's room, as `tableInit` takes it.
 * @returns {EventRegistry}
 */
export function registryInit(
    _room = {}
)
{
    return { table: eventTable.tableInit(_room) };
}

/**
 * Unbinds every letter and ends the registry.
 *
 * @param {?EventRegistry} _registry  the registry.
 */
export function registryDispose(
    _registry
)
{
    if (_registry)
    {
        eventTable.tableDispose(_registry.table);
    }

    return;
}

// 1.2
/**
 * Appends a letter to a key's word: `tableBind` on the registry's table.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {EventStep}      _step      the handler.
 * @param {?function(*): void} [_stateFree=null]  called with the step's
 *        state when the letter is unbound.
 * @returns {{status: number, id: number}}
 */
export function registryBind(
    _registry,
    _key,
    _step,
    _stateFree = null
)
{
    if (!_registry)
    {
        return { status: STATUS.ERR_NULL, id: HANDLER_ID_NULL };
    }

    return eventTable.tableBind(_registry.table, _key, _step, _stateFree);
}

/**
 * Unbinds the letter of an id: `tableUnbind` on the registry's table.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {number}          _id        the letter's id.
 * @returns {number}
 */
export function registryUnbind(
    _registry,
    _id
)
{
    if (!_registry)
    {
        return STATUS.ERR_NULL;
    }

    return eventTable.tableUnbind(_registry.table, _id);
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
export function dispatchResultEmpty()
{
    return { invoked: 0, outcome: VERDICT.PASS };
}

// 2.2
/**
 * Folds a key's word over one occurrence: each enabled letter in the
 * order it was bound, until one consumes.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {*}               _payload   the occurrence's payload, handed to
 *        each handler; the handlers may change what it refers to.
 * @returns {{invoked: number, outcome: number}} how many handlers were
 *          invoked, and the word's VERDICT.
 */
export function registryDispatch(
    _registry,
    _key,
    _payload
)
{
    const result = dispatchResultEmpty();

    if ( !_registry ||
         !eventTable.internal.ready(_registry.table) )
    {
        return result;
    }

    const table     = _registry.table;
    const bound     = table.nextId - 1;
    const outermost = eventTable.internal.dispatchBegin(table);

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

        const folded = stepFold([entry.step], _payload);

        result.invoked += folded.invoked;

        if (verdictIsConsumed(folded.verdict))
        {
            result.outcome = VERDICT.CONSUME;

            break;
        }
    }

    eventTable.internal.dispatchEnd(table, outermost);

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
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {Array<*>}        _payloads  each occurrence's payload.
 * @returns {{occurrences: number, handlersInvoked: number,
 *            consumedCount: number}} how many occurrences were
 *          dispatched, how many handlers were invoked over them all, and
 *          how many occurrences were consumed.
 */
export function registryRun(
    _registry,
    _key,
    _payloads
)
{
    const run = { occurrences: 0, handlersInvoked: 0, consumedCount: 0 };

    if (!_registry)
    {
        return run;
    }

    for (const payload of (_payloads ?? []))
    {
        const result = registryDispatch(_registry, _key, payload);

        ++run.occurrences;
        run.handlersInvoked += result.invoked;

        if (verdictIsConsumed(result.outcome))
        {
            ++run.consumedCount;
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
 * @typedef {{key: bigint, steps: Array<EventStep>}} EventWord
 */

// 4.1
/**
 * Copies out a key's enabled letters as a word.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @returns {{status: number, word: ?EventWord}} OK and the word; ERR_NULL
 *          and no word for no registry.
 */
export function registryCompile(
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
            steps: eventTable.tableWord(_registry.table, _key)
                             .filter((_entry) => _entry.enabled)
                             .map((_entry) => _entry.step)
        }
    };
}

// 4.2
/**
 * Folds a word over one occurrence.
 *
 * @param {?EventWord} _word     the word; none is the empty word.
 * @param {*}           _payload  the payload.
 * @returns {{verdict: number, invoked: number}}
 */
export function wordRunOne(
    _word,
    _payload
)
{
    return stepFold(_word ? _word.steps : [], _payload);
}

/**
 * Folds a word over a row of occurrences, in order.
 *
 * @param {?EventWord} _word      the word.
 * @param {Array<*>}    _payloads  each occurrence's payload.
 * @returns {{occurrences: number, consumedCount: number}}
 */
export function wordDrive(
    _word,
    _payloads
)
{
    const drive = { occurrences: 0, consumedCount: 0 };

    if (!_word)
    {
        return drive;
    }

    for (const payload of (_payloads ?? []))
    {
        ++drive.occurrences;

        if (verdictIsConsumed(wordRunOne(_word, payload).verdict))
        {
            ++drive.consumedCount;
        }
    }

    return drive;
}
