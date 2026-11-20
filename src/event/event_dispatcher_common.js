/*******************************************************************************
* djinterp.js [event]                                 event_dispatcher_common.js
*
*   A registry and a queue, as one thing a program posts to and listens
* on. `fire` delivers an occurrence at once; `queue` sets one aside, and
* `process` delivers those set aside, in the order they were queued.
* Deferring changes when an occurrence is delivered and nothing else: the
* suite checks that queue-then-process gives what fire gives.
*   A handler may queue while the queue is being processed: what it queues
* waits for the next call. It may not process: a nested call is refused,
* and delivers nothing.
*   The reference copies a queued payload's bytes, because the caller's may
* be gone before the occurrence is delivered. The queue here copies a
* payload with `structuredClone` for the same reason -- what is delivered
* is what was queued, whatever the caller does to its own afterwards. A
* payload that cannot be copied so is not data, and queueing it throws.
* The reference's arena of payload bytes is not here; the queue's room is
* a count of occurrences, and it has none unless given.
*   reference: inc/djinterp/c/event/event_dispatcher_common.h and
*              src/djinterp/c/event/event_dispatcher_common.c, at 3eb096c9
*
*
* path:      /src/event/event_dispatcher_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.17
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  THE QUEUE
    ---------
    1.  queueInit, queueClear
    2.  queueEnqueue, queueProcess
    3.  queuePending, queueIsEmpty, queuePeek
2.  THE DISPATCHER
    --------------
    1.  dispatcherInit, dispatcherDispose
    2.  dispatcherBind, dispatcherUnbind, dispatcherEnable,
        dispatcherDisable, dispatcherIsEnabled, dispatcherContains
    3.  dispatcherFire, dispatcherQueue, dispatcherProcess,
        dispatcherProcessAll, dispatcherRun, dispatcherCompile
    4.  dispatcherMerge
    5.  dispatcherHandlerCount, dispatcherEnabledCount,
        dispatcherHandlerCountFor, dispatcherPending
*/

import data from '../../generated/event.js';
import { HANDLER_ID_NULL, STATUS, verdictIsConsumed }
    from './event_common.js';
import * as eventRegistry from './event_registry_common.js';
import * as eventTable from './event_table_common.js';

// the types of other modules that this one's comments name
/** @import { EventRegistry } from './event_registry_common.js' */
/** @import { EventStep } from './event_handler_common.js' */
/** @import { EventWord } from './event_registry_common.js' */

const DROP_OLDEST = (data.queue_overflow === data.queue_overflow_drop_oldest);


//==============================================================================
// 1.  THE QUEUE
//==============================================================================

/**
 * A queue of occurrences. Made by `queueInit`.
 *
 * @typedef {object} EventQueue
 * @property {Array<{key: bigint, payload: *}>} slots  the occurrences
 *           queued, the oldest first, each with a copy of its payload.
 * @property {number}  capacity    the most it holds.
 * @property {boolean} processing  whether it is being processed, the
 *           first slot being the occurrence in flight.
 */

// 1.1
/**
 * An empty queue.
 *
 * @param {object} [_room]  the queue's room.
 * @param {number} [_room.capacity=Infinity]  the most occurrences it
 *        holds.
 * @returns {EventQueue}
 */
export function queueInit(
    _room = {}
)
{
    return { slots: [], capacity: _room.capacity ?? Infinity,
             processing: false };
}

/**
 * Drops every queued occurrence; while the queue is being processed, every
 * one but the one being delivered.
 *
 * @param {?EventQueue} _queue  the queue.
 */
export function queueClear(
    _queue
)
{
    if ( !_queue ||
         (_queue.slots.length === 0) )
    {
        return;
    }

    // keep only the occurrence in flight
    _queue.slots.length = _queue.processing ? 1 : 0;

    return;
}

// 1.2
/**
 * Sets an occurrence aside, after those already queued. Its payload is
 * copied.
 *
 * @param {?EventQueue} _queue    the queue.
 * @param {bigint}       _key      the occurrence's key.
 * @param {*}            [_payload]  its payload; data, as
 *        `structuredClone` takes it.
 * @returns {number} OK; ERR_NULL for no queue; ERR_CAPACITY for a queue
 *          that is full, under the reference's overflow policy, which
 *          refuses the new occurrence.
 */
export function queueEnqueue(
    _queue,
    _key,
    _payload
)
{
    if (!_queue)
    {
        return STATUS.ERR_NULL;
    }

    while (_queue.slots.length >= _queue.capacity)
    {
        // drop the oldest to make room, unless it is in flight
        if ( DROP_OLDEST               &&
             (_queue.slots.length > 0) &&
             !_queue.processing )
        {
            _queue.slots.shift();

            continue;
        }

        return STATUS.ERR_CAPACITY;
    }

    // by value: what is delivered is what was queued
    _queue.slots.push({
        key:     _key,
        payload: (_payload === undefined) ? undefined
                                          : structuredClone(_payload)
    });

    return STATUS.OK;
}

/**
 * Delivers queued occurrences, oldest first: at most `_max`, and never
 * more than were queued when the call began.
 *
 * @param {?EventQueue}    _queue     the queue.
 * @param {?EventRegistry} _registry  what they are dispatched over.
 * @param {number}          [_max=0]   the most to deliver; 0 for every
 *        one queued at the call.
 * @returns {{processed: number, result: {occurrences: number,
 *            handlersInvoked: number, consumedCount: number}}} how many
 *          were delivered, and their dispatches summed. Nothing, for a
 *          call made by a handler of the queue being processed.
 */
export function queueProcess(
    _queue,
    _registry,
    _max = 0
)
{
    const run     = { occurrences: 0, handlersInvoked: 0,
                      consumedCount: 0 };
    let processed = 0;

    // both are required, and a handler of this queue may not re-enter it
    if ( !_queue    ||
         !_registry ||
         _queue.processing )
    {
        return { processed: 0, result: run };
    }

    const prefix = ( (_max === 0) ||
                     (_max > _queue.slots.length) ) ? _queue.slots.length
                                                    : _max;

    _queue.processing = true;

    // dispatch the prefix in order, releasing each occurrence after it runs
    while ( (processed < prefix) &&
            (_queue.slots.length > 0) )
    {
        const slot   = _queue.slots[0];
        const result = eventRegistry.registryDispatch(_registry, slot.key,
                                                      slot.payload);

        ++processed;
        ++run.occurrences;
        run.handlersInvoked += result.invoked;

        if (verdictIsConsumed(result.outcome))
        {
            ++run.consumedCount;
        }

        // release it, unless a handler cleared the queue out from under it
        if (_queue.slots.length > 0)
        {
            _queue.slots.shift();
        }
    }

    _queue.processing = false;

    return { processed: processed, result: run };
}

// 1.3
/**
 * How many occurrences are queued.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {number}
 */
export function queuePending(
    _queue
)
{
    return _queue ? _queue.slots.length : 0;
}

/**
 * Whether nothing is queued.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {boolean}
 */
export function queueIsEmpty(
    _queue
)
{
    return (queuePending(_queue) === 0);
}

/**
 * The oldest queued occurrence, left where it is.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {?{key: bigint, payload: *}} null for an empty queue.
 */
export function queuePeek(
    _queue
)
{
    return ( _queue &&
             (_queue.slots.length > 0) ) ? _queue.slots[0] : null;
}


//==============================================================================
// 2.  THE DISPATCHER
//==============================================================================

/**
 * A dispatcher: `registry` is its registry and `queue` its queue.
 *
 * @typedef {{registry: EventRegistry, queue: EventQueue}}
 *          EventDispatcher
 */

// 2.1
/**
 * A dispatcher with no handlers and nothing queued.
 *
 * @param {object} [_room]  its room.
 * @param {number} [_room.capacity=Infinity]  the most handlers bound.
 * @param {number} [_room.queue=Infinity]     the most occurrences queued.
 * @returns {EventDispatcher}
 */
export function dispatcherInit(
    _room = {}
)
{
    return {
        registry: eventRegistry.registryInit({ capacity: _room.capacity }),
        queue:    queueInit({ capacity: _room.queue })
    };
}

/**
 * Drops what is queued, unbinds every handler, and ends the dispatcher.
 * Asked for by a handler while the queue is being processed, the queue is
 * left as it is.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 */
export function dispatcherDispose(
    _dispatcher
)
{
    if (!_dispatcher)
    {
        return;
    }

    // a handler of the queue being processed may not end it
    if (!_dispatcher.queue.processing)
    {
        _dispatcher.queue.slots.length = 0;
    }

    eventRegistry.registryDispose(_dispatcher.registry);

    return;
}

// 2.2
/**
 * Binds a handler to a key, after those already bound to it.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @param {EventStep}        _step        the handler.
 * @param {?function(*): void} [_stateFree=null]  called with the step's
 *        state when the handler is unbound.
 * @returns {{status: number, id: number}} OK and the handler's id.
 */
export function dispatcherBind(
    _dispatcher,
    _key,
    _step,
    _stateFree = null
)
{
    if (!_dispatcher)
    {
        return { status: STATUS.ERR_NULL, id: HANDLER_ID_NULL };
    }

    return eventRegistry.registryBind(_dispatcher.registry, _key, _step,
                                      _stateFree);
}

/**
 * Unbinds a handler.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_NOT_FOUND for no such handler.
 */
export function dispatcherUnbind(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? eventRegistry.registryUnbind(_dispatcher.registry, _id)
               : STATUS.ERR_NULL;
}

/**
 * Turns a handler on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already on; ERR_NOT_FOUND.
 */
export function dispatcherEnable(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? eventTable.tableEnable(_dispatcher.registry.table, _id)
               : STATUS.ERR_NULL;
}

/**
 * Turns a handler off: it keeps its place and is passed over.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already off; ERR_NOT_FOUND.
 */
export function dispatcherDisable(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? eventTable.tableDisable(_dispatcher.registry.table, _id)
               : STATUS.ERR_NULL;
}

/**
 * Whether a handler is bound and on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcherIsEnabled(
    _dispatcher,
    _id
)
{
    return ( !!_dispatcher &&
             eventTable.tableIsEnabled(_dispatcher.registry.table, _id) );
}

/**
 * Whether a handler is bound.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcherContains(
    _dispatcher,
    _id
)
{
    return ( !!_dispatcher &&
             eventTable.tableContains(_dispatcher.registry.table, _id) );
}

// 2.3
/**
 * Delivers an occurrence at once.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload.
 * @returns {{invoked: number, outcome: number}}
 */
export function dispatcherFire(
    _dispatcher,
    _key,
    _payload
)
{
    return _dispatcher
               ? eventRegistry.registryDispatch(_dispatcher.registry, _key,
                                                _payload)
               : eventRegistry.dispatchResultEmpty();
}

/**
 * Sets an occurrence aside, to be delivered by `dispatcherProcess`.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload, copied.
 * @returns {number} OK; ERR_CAPACITY for a queue that is full.
 */
export function dispatcherQueue(
    _dispatcher,
    _key,
    _payload
)
{
    return _dispatcher ? queueEnqueue(_dispatcher.queue, _key, _payload)
                       : STATUS.ERR_NULL;
}

/**
 * Delivers queued occurrences, oldest first.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            [_max=0]     the most to deliver; 0 for
 *        every one queued at the call.
 * @returns {{processed: number, result: object}} as `queueProcess`.
 */
export function dispatcherProcess(
    _dispatcher,
    _max = 0
)
{
    return _dispatcher
               ? queueProcess(_dispatcher.queue, _dispatcher.registry, _max)
               : queueProcess(null, null, _max);
}

/**
 * Delivers every occurrence queued at the call.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number} how many were delivered.
 */
export function dispatcherProcessAll(
    _dispatcher
)
{
    return dispatcherProcess(_dispatcher, 0).processed;
}

/**
 * Delivers a row of occurrences of one key at once, in order.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @param {Array<*>}          _payloads    each occurrence's payload.
 * @returns {{occurrences: number, handlersInvoked: number,
 *            consumedCount: number}}
 */
export function dispatcherRun(
    _dispatcher,
    _key,
    _payloads
)
{
    return eventRegistry.registryRun(_dispatcher ? _dispatcher.registry
                                                 : null,
                                     _key, _payloads);
}

/**
 * Copies out a key's enabled handlers as a word.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {{status: number, word: ?EventWord}}
 */
export function dispatcherCompile(
    _dispatcher,
    _key
)
{
    return eventRegistry.registryCompile(_dispatcher ? _dispatcher.registry
                                                     : null,
                                         _key);
}

// 2.4
/**
 * Appends another dispatcher's handlers to this one's, key by key, this
 * one's first. What the other has queued is not taken.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher merged into.
 * @param {?EventDispatcher} _other       the dispatcher merged from.
 * @returns {{status: number, merged: number}} as `tableMerge`.
 */
export function dispatcherMerge(
    _dispatcher,
    _other
)
{
    if ( !_dispatcher ||
         !_other )
    {
        return { status: STATUS.ERR_NULL, merged: 0 };
    }

    return eventTable.tableMerge(_dispatcher.registry.table,
                                 _other.registry.table);
}

// 2.5
/**
 * How many handlers are bound.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherHandlerCount(
    _dispatcher
)
{
    return _dispatcher
               ? eventTable.tableCount(_dispatcher.registry.table)
               : 0;
}

/**
 * How many bound handlers are on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherEnabledCount(
    _dispatcher
)
{
    return _dispatcher
               ? eventTable.tableEnabledCount(_dispatcher.registry.table)
               : 0;
}

/**
 * How many handlers are bound to a key.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {number}
 */
export function dispatcherHandlerCountFor(
    _dispatcher,
    _key
)
{
    return _dispatcher
               ? eventTable.tableCountFor(_dispatcher.registry.table, _key)
               : 0;
}

/**
 * How many occurrences are queued.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherPending(
    _dispatcher
)
{
    return _dispatcher ? queuePending(_dispatcher.queue) : 0;
}
