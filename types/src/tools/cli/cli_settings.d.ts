/**
 * Why a setting was refused, in the kit's words: an unknown name, with the
 * name it was probably meant to be; a value that is not built; a value the
 * setting does not take; or the status's name.
 *
 * @param {OptionEnvRegistry} _registry  the registry the name was
 *        looked for in.
 * @param {number}  _status    the refusal's status.
 * @param {string}  _name      the setting's name as written.
 * @param {?string} _value     the value as written, or null for
 *        none.
 * @param {number}  [_capacity=256]  the room the reference's caller gives
 *        the message, with its terminator; a longer one is cut short.
 * @returns {string} the message.
 */
export function why(_registry: optionEnvRegistry.OptionEnvRegistry, _status: number, _name: string, _value: string | null, _capacity?: number): string;
/**
 * Binds a settings file's statements, as the file. A statement refused
 * does not stop the rest: it is reported, with its line, and the load
 * goes on after it.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string} _script  the file's text.
 * @param {function(number, string): void} _report  told each refusal: the
 *        statement's line, from 1, and why.
 */
export function load(_registry: optionEnvRegistry.OptionEnvRegistry, _script: string, _report: (arg0: number, arg1: string) => void): void;
/**
 * Readies a run's settings: the environment's, under `DJINTERP_` and then
 * the program's own prefix, whose binding wins; then the user's file's. A
 * value the environment gives that is refused is passed over in silence,
 * as the reference passes it; a statement of the file that is refused is
 * said as a warning, `FILE:LINE: warning: MESSAGE`.
 *
 * @param {DjinterpProgram} _program  the program: its `registry`, `name`,
 *        `environment` and `file` are read.
 * @returns {string} the warnings, a line each.
 */
export function start(_program: DjinterpProgram): string;
/**
 * What the kit says of a setting the command line gave and the registry
 * refused: the message of a usage error.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {Array<string>} _argv    the command line.
 * @param {number}        _at      where the option stands on it.
 * @param {number}        _status  the refusal's status.
 * @returns {string} the message.
 */
export function saidFor(_registry: optionEnvRegistry.OptionEnvRegistry, _argv: Array<string>, _at: number, _status: number): string;
/**
 * Takes the settings a command line gives, wherever they stand on it --
 * "--set NAME=VALUE", "--DJIN.NAME=VALUE", "--DJIN.NAME" and
 * "--no-DJIN.NAME" -- and binds each as the command line; the arguments
 * left are the command's.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {Array<string>} _argv      the command line, the program's name
 *        first.
 * @param {ReadonlyArray<string>} _commands  the names of the program's
 *        commands: a refusal is said of the one the walk has reached.
 * @param {ReadonlyArray<string>} [_own=[]]  the long options that are the
 *        program's own, as typed without a value: none is taken for a
 *        setting's, whatever settings there are.
 * @returns {{kept: Array<string>, refused: ?{command: ?string,
 *            message: string}}} the arguments kept; and for a setting
 *          refused, which stops the walk, the command reached, or null
 *          for none, and the usage error's message.
 */
export function take(_registry: optionEnvRegistry.OptionEnvRegistry, _argv: Array<string>, _commands: ReadonlyArray<string>, _own?: ReadonlyArray<string>): {
    kept: Array<string>;
    refused: {
        command: string | null;
        message: string;
    } | null;
};
/**
 * A settings file as the program reads and writes it: a page's storage, a
 * file kept in memory, or what a caller gives in their place.
 */
export type SettingsFile = {
    /**
     * what a warning calls it: `NAME:LINE:`.
     */
    name: string;
    /**
     * its text; null where it is not
     * there yet. It may throw, and the program says so.
     */
    read: () => string | null;
    /**
     * makes its text that; it may
     * throw, and the program says so.
     */
    write: (arg0: string) => void;
};
import * as optionEnvRegistry from '../../option/option_env_registry.js';
import type { DjinterpProgram } from '../djinterp/djinterp_commands.js';
