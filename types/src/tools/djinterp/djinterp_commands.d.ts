/**
 * A program: a registry, the djins over it, and where its settings come
 * from. Made by `programMake`.
 *
 * @typedef {object} DjinterpProgram
 * @property {string} name  what it calls itself when it speaks.
 * @property {OptionEnvRegistry} registry  its settings.
 * @property {DjinSet} set  its djins.
 * @property {?object} file  the user's settings file
 *           (src/tools/cli/cli_settings.js), or null for none.
 * @property {*} environment  the environment, as `optionEnv.import`
 *           takes one.
 */
/**
 * A program over a registry.
 *
 * @param {object} _options  what it is made over.
 * @param {OptionEnvRegistry} _options.registry  its registry.
 * @param {?object} [_options.file=null]  the user's settings file.
 * @param {*} [_options.environment=null]  the environment.
 * @param {number} [_options.djins=16]  the most djins its set holds; the
 *        reference's program holds 16.
 * @returns {DjinterpProgram}
 */
export function programMake(_options: {
    registry: optionEnvRegistry.OptionEnvRegistry;
    file?: object | null;
    environment?: any;
    djins?: number;
}): DjinterpProgram;
/**
 * Readies the program's settings for a run, once: the environment's and
 * the user's file's (`cliSettings.start`).
 *
 * @param {DjinterpProgram} _program  the program.
 * @returns {string} what was said of the file's statements that were
 *          refused: a warning a line.
 */
export function programStart(_program: DjinterpProgram): string;
/**
 * Runs the program on a command line.
 *
 * @param {DjinterpProgram} _program  the program.
 * @param {Array<string>}    _argv     the command line's words, the
 *        program's name first: ['djinterp', 'get', 'printer.style'].
 * @returns {{status: number, out: string, err: string,
 *            set: Array<string>}} an EXIT status; what the command wrote;
 *          what it said, which is empty for a run with no trouble; and
 *          the full names a `set` bound and kept, which the reference's
 *          program has no one to tell and a page does.
 */
export function programRun(_program: DjinterpProgram, _argv: Array<string>): {
    status: number;
    out: string;
    err: string;
    set: Array<string>;
};
/**
 * What a run answers with: the kit's exit statuses.
 */
export const EXIT: Readonly<{
    OK: 0;
    NO: 1;
    TROUBLE: 2;
}>;
/**
 * The names the program keeps for its own commands, and the kit's: no djin
 * may be named one.
 */
export const RESERVED: readonly string[];
/**
 * The commands this port has.
 */
export const COMMANDS: readonly string[];
/**
 * A program: a registry, the djins over it, and where its settings come
 * from. Made by `programMake`.
 */
export type DjinterpProgram = {
    /**
     * what it calls itself when it speaks.
     */
    name: string;
    /**
     * its settings.
     */
    registry: optionEnvRegistry.OptionEnvRegistry;
    /**
     * its djins.
     */
    set: djin.DjinSet;
    /**
     * the user's settings file
     * (src/tools/cli/cli_settings.js), or null for none.
     */
    file: object | null;
    /**
     * the environment, as `optionEnv.import`
     * takes one.
     */
    environment: any;
};
import * as optionEnvRegistry from '../../option/option_env_registry.js';
import * as djin from '../../modules/interp/djin.js';
