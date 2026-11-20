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
*              src/djinterp/c/event/event_dispatcher_common.c, at d20c0b23
*
*
* path:      /src/event/event_dispatcher_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The queue
    1.  queue_init, queue_clear
    2.  queue_enqueue, queue_process
    3.  queue_pending, queue_is_empty, queue_peek
2.  The dispatcher
    1.  dispatcher_init, dispatcher_dispose
    2.  dispatcher_bind, dispatcher_unbind, dispatcher_enable,
        dispatcher_disable, dispatcher_is_enabled, dispatcher_contains
    3.  dispatcher_fire, dispatcher_queue, dispatcher_process,
        dispatcher_process_all, dispatcher_run, dispatcher_compile
    4.  dispatcher_merge
    5.  dispatcher_handler_count, dispatcher_enabled_count,
        dispatcher_handler_count_for, dispatcher_pending
*/

import data from '../../generated/event.js';
import { HANDLER_ID_NULL, STATUS, verdict_is_consumed }
    from './event_common.js';
import * as event_registry from './event_registry_common.js';
import * as event_table from './event_table_common.js';

const DROP_OLDEST = (data.queue_overflow === data.queue_overflow_drop_oldest);


//==============================================================================
// 1.  THE QUEUE
//==============================================================================

/**
 * A queue of occurrences. Made by `queue_init`.
 *
 * @typedef {object} event_queue
 */

// 1.1
/**
 * An empty queue.
 *
 * @param {object} [_room]  the queue's room.
 * @param {number} [_room.capacity=Infinity]  the most occurrences it
 *        holds.
 * @returns {event_queue}
 */
export function queue_init(
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
 * @param {?event_queue} _queue  the queue.
 */
export function queue_clear(
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
 * @param {?event_queue} _queue    the queue.
 * @param {bigint}       _key      the occurrence's key.
 * @param {*}            [_payload]  its payload; data, as
 *        `structuredClone` takes it.
 * @returns {number} OK; ERR_NULL for no queue; ERR_CAPACITY for a queue
 *          that is full, under the reference's overflow policy, which
 *          refuses the new occurrence.
 */
export function queue_enqueue(
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
 * @param {?event_queue}    _queue     the queue.
 * @param {?event_registry} _registry  what they are dispatched over.
 * @param {number}          [_max=0]   the most to deliver; 0 for every
 *        one queued at the call.
 * @returns {{processed: number, result: {occurrences: number,
 *            handlers_invoked: number, consumed_count: number}}} how many
 *          were delivered, and their dispatches summed. Nothing, for a
 *          call made by a handler of the queue being processed.
 */
export function queue_process(
    _queue,
    _registry,
    _max = 0
)
{
    const run     = { occurrences: 0, handlers_invoked: 0,
                      consumed_count: 0 };
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
        const result = event_registry.registry_dispatch(_registry, slot.key,
                                                        slot.payload);

        ++processed;
        ++run.occurrences;
        run.handlers_invoked += result.invoked;

        if (verdict_is_consumed(result.outcome))
        {
            ++run.consumed_count;
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
 * @param {?event_queue} _queue  the queue.
 * @returns {number}
 */
export function queue_pending(
    _queue
)
{
    return _queue ? _queue.slots.length : 0;
}

/**
 * Whether nothing is queued.
 *
 * @param {?event_queue} _queue  the queue.
 * @returns {boolean}
 */
export function queue_is_empty(
    _queue
)
{
    return (queue_pending(_queue) === 0);
}

/**
 * The oldest queued occurrence, left where it is.
 *
 * @param {?event_queue} _queue  the queue.
 * @returns {?{key: bigint, payload: *}} null for an empty queue.
 */
export function queue_peek(
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
 * @typedef {{registry: event_registry, queue: event_queue}}
 *          event_dispatcher
 */

// 2.1
/**
 * A dispatcher with no handlers and nothing queued.
 *
 * @param {object} [_room]  its room.
 * @param {number} [_room.capacity=Infinity]  the most handlers bound.
 * @param {number} [_room.queue=Infinity]     the most occurrences queued.
 * @returns {event_dispatcher}
 */
export function dispatcher_init(
    _room = {}
)
{
    return {
        registry: event_registry.registry_init({ capacity: _room.capacity }),
        queue:    queue_init({ capacity: _room.queue })
    };
}

/**
 * Drops what is queued, unbinds every handler, and ends the dispatcher.
 * Asked for by a handler while the queue is being processed, the queue is
 * left as it is.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 */
export function dispatcher_dispose(
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

    event_registry.registry_dispose(_dispatcher.registry);

    return;
}

// 2.2
/**
 * Binds a handler to a key, after those already bound to it.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @param {event_step}        _step        the handler.
 * @param {?function(*): void} [_state_free=null]  called with the step's
 *        state when the handler is unbound.
 * @returns {{status: number, id: number}} OK and the handler's id.
 */
export function dispatcher_bind(
    _dispatcher,
    _key,
    _step,
    _state_free = null
)
{
    if (!_dispatcher)
    {
        return { status: STATUS.ERR_NULL, id: HANDLER_ID_NULL };
    }

    return event_registry.registry_bind(_dispatcher.registry, _key, _step,
                                        _state_free);
}

/**
 * Unbinds a handler.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_NOT_FOUND for no such handler.
 */
export function dispatcher_unbind(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? event_registry.registry_unbind(_dispatcher.registry, _id)
               : STATUS.ERR_NULL;
}

/**
 * Turns a handler on.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already on; ERR_NOT_FOUND.
 */
export function dispatcher_enable(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? event_table.table_enable(_dispatcher.registry.table, _id)
               : STATUS.ERR_NULL;
}

/**
 * Turns a handler off: it keeps its place and is passed over.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already off; ERR_NOT_FOUND.
 */
export function dispatcher_disable(
    _dispatcher,
    _id
)
{
    return _dispatcher
               ? event_table.table_disable(_dispatcher.registry.table, _id)
               : STATUS.ERR_NULL;
}

/**
 * Whether a handler is bound and on.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcher_is_enabled(
    _dispatcher,
    _id
)
{
    return ( !!_dispatcher &&
             event_table.table_is_enabled(_dispatcher.registry.table, _id) );
}

/**
 * Whether a handler is bound.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcher_contains(
    _dispatcher,
    _id
)
{
    return ( !!_dispatcher &&
             event_table.table_contains(_dispatcher.registry.table, _id) );
}

// 2.3
/**
 * Delivers an occurrence at once.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload.
 * @returns {{invoked: number, outcome: number}}
 */
export function dispatcher_fire(
    _dispatcher,
    _key,
    _payload
)
{
    return _dispatcher
               ? event_registry.registry_dispatch(_dispatcher.registry, _key,
                                                  _payload)
               : event_registry.dispatch_result_empty();
}

/**
 * Sets an occurrence aside, to be delivered by `dispatcher_process`.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload, copied.
 * @returns {number} OK; ERR_CAPACITY for a queue that is full.
 */
export function dispatcher_queue(
    _dispatcher,
    _key,
    _payload
)
{
    return _dispatcher ? queue_enqueue(_dispatcher.queue, _key, _payload)
                       : STATUS.ERR_NULL;
}

/**
 * Delivers queued occurrences, oldest first.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {number}            [_max=0]     the most to deliver; 0 for
 *        every one queued at the call.
 * @returns {{processed: number, result: object}} as `queue_process`.
 */
export function dispatcher_process(
    _dispatcher,
    _max = 0
)
{
    return _dispatcher
               ? queue_process(_dispatcher.queue, _dispatcher.registry, _max)
               : queue_process(null, null, _max);
}

/**
 * Delivers every occurrence queued at the call.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @returns {number} how many were delivered.
 */
export function dispatcher_process_all(
    _dispatcher
)
{
    return dispatcher_process(_dispatcher, 0).processed;
}

/**
 * Delivers a row of occurrences of one key at once, in order.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @param {Array<*>}          _payloads    each occurrence's payload.
 * @returns {{occurrences: number, handlers_invoked: number,
 *            consumed_count: number}}
 */
export function dispatcher_run(
    _dispatcher,
    _key,
    _payloads
)
{
    return event_registry.registry_run(_dispatcher ? _dispatcher.registry
                                                   : null,
                                       _key, _payloads);
}

/**
 * Copies out a key's enabled handlers as a word.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {{status: number, word: ?event_word}}
 */
export function dispatcher_compile(
    _dispatcher,
    _key
)
{
    return event_registry.registry_compile(_dispatcher ? _dispatcher.registry
                                                       : null,
                                           _key);
}

// 2.4
/**
 * Appends another dispatcher's handlers to this one's, key by key, this
 * one's first. What the other has queued is not taken.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher merged into.
 * @param {?event_dispatcher} _other       the dispatcher merged from.
 * @returns {{status: number, merged: number}} as `table_merge`.
 */
export function dispatcher_merge(
    _dispatcher,
    _other
)
{
    if ( !_dispatcher ||
         !_other )
    {
        return { status: STATUS.ERR_NULL, merged: 0 };
    }

    return event_table.table_merge(_dispatcher.registry.table,
                                   _other.registry.table);
}

// 2.5
/**
 * How many handlers are bound.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcher_handler_count(
    _dispatcher
)
{
    return _dispatcher
               ? event_table.table_count(_dispatcher.registry.table)
               : 0;
}

/**
 * How many bound handlers are on.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcher_enabled_count(
    _dispatcher
)
{
    return _dispatcher
               ? event_table.table_enabled_count(_dispatcher.registry.table)
               : 0;
}

/**
 * How many handlers are bound to a key.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {number}
 */
export function dispatcher_handler_count_for(
    _dispatcher,
    _key
)
{
    return _dispatcher
               ? event_table.table_count_for(_dispatcher.registry.table, _key)
               : 0;
}

/**
 * How many occurrences are queued.
 *
 * @param {?event_dispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcher_pending(
    _dispatcher
)
{
    return _dispatcher ? queue_pending(_dispatcher.queue) : 0;
}
