/**
 * The key of an event's name: FNV-1a-64 over the name's bytes in UTF-8, up
 * to a NUL. A name that hashes to 0 is given 1, so that KEY_NONE stays
 * reserved.
 *
 * @param {?string} _name  the event's name.
 * @returns {bigint} the key; KEY_NONE for no name.
 */
export function keyOfName(_name: string | null): bigint;
/**
 * Whether a verdict is CONSUME.
 *
 * @param {number} _verdict  the verdict.
 * @returns {boolean}
 */
export function verdictIsConsumed(_verdict: number): boolean;
/** The key that names no event. `keyOfName` never gives it. */
export const KEY_NONE: bigint;
/**
 * The handler id that names no handler. An id is a count of bindings from
 * 1, held as a number: the reference holds it in 64 bits, and a table
 * would have to bind 2^53 handlers for a number to fail it.
 */
export const HANDLER_ID_NULL: number;
/**
 * What a handler gives: PASS, or CONSUME, after which no later handler of
 * the occurrence is invoked.
 */
export const VERDICT: any;
/**
 * The outcome of a table's or a queue's operation, by the reference's
 * names without their prefix: `STATUS.ERR_NOT_FOUND` is
 * D_EVENT_ERR_NOT_FOUND.
 */
export const STATUS: any;
