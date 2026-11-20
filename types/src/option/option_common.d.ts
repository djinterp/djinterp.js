/**
 * A status's name, as the reference spells it; "UNKNOWN" for a code that is
 * none.
 *
 * @param {number} _status  the code.
 * @returns {string} the name.
 */
export function statusName(_status: number): string;
/**
 * A status's message, in the reference's words.
 *
 * @param {number} _status  the code.
 * @returns {string} the message.
 */
export function statusMessage(_status: number): string;
/**
 * Whether a status is mechanical.
 *
 * @param {number} _status  the code.
 * @returns {boolean}
 */
export function statusIsMechanical(_status: number): boolean;
/**
 * What an operation answers: `isOk` with a `value`, or not with an
 * `error`, which is a status. The reference's struct dj_option_result, its
 * payload's two members side by side. An operation whose reference has an
 * out-parameter adds that as a member of its own, named in its note.
 *
 * @typedef {{isOk: boolean, value?: number, error?: number}} OptionResult
 */
/**
 * A success.
 *
 * @param {number} _value  what it carries.
 * @returns {OptionResult}
 */
export function ok(_value: number): OptionResult;
/**
 * A failure.
 *
 * @param {number} _status  why.
 * @returns {OptionResult}
 */
export function fail(_status: number): OptionResult;
/**
 * A result's status: OK for a success, the error for a failure.
 *
 * @param {OptionResult} _result  the result.
 * @returns {number} the status.
 */
export function resultStatus(_result: OptionResult): number;
/**
 * The statuses, by the reference's names without their prefix:
 * `STATUS.KEY_ABSENT` is D_OPTION_STATUS_KEY_ABSENT.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const STATUS: Readonly<Record<string, number>>;
/**
 * The first mechanical status: one that says the machine ran out of room,
 * not that what it was asked is wrong.
 *
 * @type {number}
 */
export const STATUS_MECHANICAL_FLOOR: number;
/**
 * What an operation answers: `isOk` with a `value`, or not with an
 * `error`, which is a status. The reference's struct dj_option_result, its
 * payload's two members side by side. An operation whose reference has an
 * out-parameter adds that as a member of its own, named in its note.
 */
export type OptionResult = {
    isOk: boolean;
    value?: number;
    error?: number;
};
