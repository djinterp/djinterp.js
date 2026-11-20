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
/**
 * An empty queue.
 *
 * @param {object} [_room]  the queue's room.
 * @param {number} [_room.capacity=Infinity]  the most occurrences it
 *        holds.
 * @returns {EventQueue}
 */
export function queueInit(_room?: {
    capacity?: number | undefined;
}): EventQueue;
/**
 * Drops every queued occurrence; while the queue is being processed, every
 * one but the one being delivered.
 *
 * @param {?EventQueue} _queue  the queue.
 */
export function queueClear(_queue: EventQueue | null): void;
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
export function queueEnqueue(_queue: EventQueue | null, _key: bigint, _payload?: any): number;
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
export function queueProcess(_queue: EventQueue | null, _registry: eventRegistry.EventRegistry | null, _max?: number): {
    processed: number;
    result: {
        occurrences: number;
        handlersInvoked: number;
        consumedCount: number;
    };
};
/**
 * How many occurrences are queued.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {number}
 */
export function queuePending(_queue: EventQueue | null): number;
/**
 * Whether nothing is queued.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {boolean}
 */
export function queueIsEmpty(_queue: EventQueue | null): boolean;
/**
 * The oldest queued occurrence, left where it is.
 *
 * @param {?EventQueue} _queue  the queue.
 * @returns {?{key: bigint, payload: *}} null for an empty queue.
 */
export function queuePeek(_queue: EventQueue | null): {
    key: bigint;
    payload: any;
} | null;
/**
 * A dispatcher: `registry` is its registry and `queue` its queue.
 *
 * @typedef {{registry: EventRegistry, queue: EventQueue}}
 *          EventDispatcher
 */
/**
 * A dispatcher with no handlers and nothing queued.
 *
 * @param {object} [_room]  its room.
 * @param {number} [_room.capacity=Infinity]  the most handlers bound.
 * @param {number} [_room.queue=Infinity]     the most occurrences queued.
 * @returns {EventDispatcher}
 */
export function dispatcherInit(_room?: {
    capacity?: number | undefined;
    queue?: number | undefined;
}): EventDispatcher;
/**
 * Drops what is queued, unbinds every handler, and ends the dispatcher.
 * Asked for by a handler while the queue is being processed, the queue is
 * left as it is.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 */
export function dispatcherDispose(_dispatcher: EventDispatcher | null): void;
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
export function dispatcherBind(_dispatcher: EventDispatcher | null, _key: bigint, _step: EventStep, _stateFree?: ((arg0: any) => void) | null): {
    status: number;
    id: number;
};
/**
 * Unbinds a handler.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_NOT_FOUND for no such handler.
 */
export function dispatcherUnbind(_dispatcher: EventDispatcher | null, _id: number): number;
/**
 * Turns a handler on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already on; ERR_NOT_FOUND.
 */
export function dispatcherEnable(_dispatcher: EventDispatcher | null, _id: number): number;
/**
 * Turns a handler off: it keeps its place and is passed over.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {number} OK; ERR_STATE for one already off; ERR_NOT_FOUND.
 */
export function dispatcherDisable(_dispatcher: EventDispatcher | null, _id: number): number;
/**
 * Whether a handler is bound and on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcherIsEnabled(_dispatcher: EventDispatcher | null, _id: number): boolean;
/**
 * Whether a handler is bound.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            _id          the handler's id.
 * @returns {boolean}
 */
export function dispatcherContains(_dispatcher: EventDispatcher | null, _id: number): boolean;
/**
 * Delivers an occurrence at once.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload.
 * @returns {{invoked: number, outcome: number}}
 */
export function dispatcherFire(_dispatcher: EventDispatcher | null, _key: bigint, _payload?: any): {
    invoked: number;
    outcome: number;
};
/**
 * Sets an occurrence aside, to be delivered by `dispatcherProcess`.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the occurrence's key.
 * @param {*}                 [_payload]   its payload, copied.
 * @returns {number} OK; ERR_CAPACITY for a queue that is full.
 */
export function dispatcherQueue(_dispatcher: EventDispatcher | null, _key: bigint, _payload?: any): number;
/**
 * Delivers queued occurrences, oldest first.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {number}            [_max=0]     the most to deliver; 0 for
 *        every one queued at the call.
 * @returns {{processed: number, result: object}} as `queueProcess`.
 */
export function dispatcherProcess(_dispatcher: EventDispatcher | null, _max?: number): {
    processed: number;
    result: object;
};
/**
 * Delivers every occurrence queued at the call.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number} how many were delivered.
 */
export function dispatcherProcessAll(_dispatcher: EventDispatcher | null): number;
/**
 * Delivers a row of occurrences of one key at once, in order.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @param {Array<*>}          _payloads    each occurrence's payload.
 * @returns {{occurrences: number, handlersInvoked: number,
 *            consumedCount: number}}
 */
export function dispatcherRun(_dispatcher: EventDispatcher | null, _key: bigint, _payloads: Array<any>): {
    occurrences: number;
    handlersInvoked: number;
    consumedCount: number;
};
/**
 * Copies out a key's enabled handlers as a word.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {{status: number, word: ?EventWord}}
 */
export function dispatcherCompile(_dispatcher: EventDispatcher | null, _key: bigint): {
    status: number;
    word: eventRegistry.EventWord | null;
};
/**
 * Appends another dispatcher's handlers to this one's, key by key, this
 * one's first. What the other has queued is not taken.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher merged into.
 * @param {?EventDispatcher} _other       the dispatcher merged from.
 * @returns {{status: number, merged: number}} as `tableMerge`.
 */
export function dispatcherMerge(_dispatcher: EventDispatcher | null, _other: EventDispatcher | null): {
    status: number;
    merged: number;
};
/**
 * How many handlers are bound.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherHandlerCount(_dispatcher: EventDispatcher | null): number;
/**
 * How many bound handlers are on.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherEnabledCount(_dispatcher: EventDispatcher | null): number;
/**
 * How many handlers are bound to a key.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @param {bigint}            _key         the key.
 * @returns {number}
 */
export function dispatcherHandlerCountFor(_dispatcher: EventDispatcher | null, _key: bigint): number;
/**
 * How many occurrences are queued.
 *
 * @param {?EventDispatcher} _dispatcher  the dispatcher.
 * @returns {number}
 */
export function dispatcherPending(_dispatcher: EventDispatcher | null): number;
/**
 * A queue of occurrences. Made by `queueInit`.
 */
export type EventQueue = {
    /**
     * the occurrences
     * queued, the oldest first, each with a copy of its payload.
     */
    slots: Array<{
        key: bigint;
        payload: any;
    }>;
    /**
     * the most it holds.
     */
    capacity: number;
    /**
     * whether it is being processed, the
     * first slot being the occurrence in flight.
     */
    processing: boolean;
};
/**
 * A dispatcher: `registry` is its registry and `queue` its queue.
 */
export type EventDispatcher = {
    registry: eventRegistry.EventRegistry;
    queue: EventQueue;
};
import * as eventRegistry from './event_registry_common.js';
import type { EventStep } from './event_handler_common.js';
