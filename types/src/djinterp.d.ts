/**
 * A line's words. Spaces and tabs separate words. A span in double quotes
 * keeps its spaces, with \" and \\ read as a quote and a backslash; a
 * span in apostrophes is kept as it is. Quoted spans and plain text join
 * into one word where nothing separates them, so that
 * `set title="two words"` has two words. A backslash anywhere else is
 * itself.
 *
 * @param {string} _line  the line.
 * @returns {?Array<string>} the words; null for a quote that is not
 *          closed.
 */
export function split(_line: string): Array<string> | null;
/**
 * A settings file kept in memory: it lasts as long as what holds it.
 *
 * @param {string}  [_name='djinterp/settings']  what the file is called
 *        when the program speaks of it.
 * @param {?string} [_text=null]  its text to start with; null for a file
 *        that is not there yet.
 * @returns {{name: string, read: function(): ?string,
 *            write: function(string): void}}
 */
export function memoryFile(_name?: string, _text?: string | null): {
    name: string;
    read: () => string | null;
    write: (arg0: string) => void;
};
/**
 * A settings file kept in a Storage the page hands over, such as its
 * localStorage, under one key. A Storage that refuses -- one that is full,
 * or closed to the page -- throws, and the program says so as the
 * reference says a file it cannot write.
 *
 * @param {{getItem: function(string): ?string,
 *          setItem: function(string, string): void}} _storage  the
 *        Storage.
 * @param {string} [_key='djinterp/settings']  the key the text is kept
 *        under, and what the file is called.
 * @returns {{name: string, read: function(): ?string,
 *            write: function(string): void}}
 */
export function storageFile(_storage: {
    getItem: (arg0: string) => string | null;
    setItem: (arg0: string, arg1: string) => void;
}, _key?: string): {
    name: string;
    read: () => string | null;
    write: (arg0: string) => void;
};
/**
 * A named frame of settings: made, named, its rows declared and its
 * scopes named, ready to be a djin's `settings` or to be listed with no
 * record. A row the frame refuses is the page's own mistake, and throws.
 *
 * @param {string}            _name    the frame's name: the djin's.
 * @param {Array<OptionRow>} _rows    its rows.
 * @param {Array<string>}     [_scopes=[]]  its scopes' names.
 * @returns {OptionEnv} the frame.
 */
export function settingsFrame(_name: string, _rows: Array<optionEnv.OptionRow>, _scopes?: Array<string>): optionEnv.OptionEnv;
/**
 * Opens a session over a program already made
 * (djinterpCommands.programMake): for a caller that built the registry
 * and the set of djins itself. `openNow` is this over a program it
 * makes.
 *
 * @param {object}  _program  the program.
 * @param {object}  [_options]
 * @param {?string} [_options.query=null]  a URL's query, bound as the
 *        command line of every line.
 * @returns {DjinterpSession}
 */
export function openProgram(_program: object, _options?: {
    query?: string | null;
}): DjinterpSession;
/**
 * Opens a program: a registry named "djinterp", the djins given, and the
 * settings of a run readied -- the environment's, the settings file's,
 * and the query's, each bound as the source it is. One call is one run of
 * the reference's program from its start; `run` then gives it lines, and
 * what one line binds stays bound for the next.
 *
 * @param {object} [_options]  what the program is made of.
 * @param {Array<OptionRow>} [_options.settings=[]]  the program's own
 *        settings: the registry's root's.
 * @param {Array<string>} [_options.scopes=[]]  the root's scopes.
 * @param {Array<DjinRecord>} [_options.djins=[]]  its djins.
 * @param {Array<OptionEnv>} [_options.frames=[]]  named frames of
 *        settings with no djin's record.
 * @param {?object} [_options.file]  the user's settings file; one in
 *        memory where left out, none for null: `set` then binds for the
 *        run and says it has nowhere to keep what it set.
 * @param {*} [_options.environment=null]  the environment, as
 *        `optionEnv.import` takes one: `DJINTERP_PRINTER_STYLE` names
 *        `printer.style`.
 * @param {?string} [_options.query=null]  a URL's query, such as
 *        `location.search`, bound as the command line.
 * @returns {DjinterpSession}
 * @throws {Error} for a row or a djin the reference refuses: the page's
 *         own mistake.
 */
export function openNow(_options?: {
    settings?: Array<optionEnv.OptionRow>;
    scopes?: Array<string>;
    djins?: Array<djin.DjinRecord>;
    frames?: Array<optionEnv.OptionEnv>;
    file?: object | null;
    environment?: any;
    query?: string | null;
}): DjinterpSession;
/**
 * Opens a program, as `openNow` does, and answers with a promise of it:
 * the interface a page is written to, whatever engine answers it.
 *
 * @param {object} [_options]  as `openNow` takes them.
 * @returns {Promise<DjinterpSession>}  broken with an Error for a row
 *          or a djin the reference refuses.
 */
export function open(_options?: object): Promise<DjinterpSession>;
/**
 * What a line is answered with.
 */
export type DjinterpReply = {
    /**
     * the program's exit status for the line: 0,
     * 1 for no, 2 for trouble.
     */
    status: number;
    /**
     * what it wrote.
     */
    out: string;
    /**
     * what it said.
     */
    err: string;
};
/**
 * An open program. Made by `open`.
 */
export type DjinterpSession = {
    /**
     * its settings.
     */
    registry: optionEnvRegistry.OptionEnvRegistry;
    /**
     * its djins.
     */
    set: djin.DjinSet;
    /**
     * the program under it.
     */
    program: djinterpCommands.DjinterpProgram;
    /**
     * what was said while its settings were
     * readied: a line for each statement of the settings file, and
     * each piece of the query, that was refused.
     */
    warnings: string;
    /**
     * gives the program one command line: a line, which
     * `split` makes words of, or an array of the words, which are
     * passed on untouched. What the program says as it starts
     * again comes first in the reply's `err`. What is heard of the
     * line has been heard by the time the promise is kept. Anything
     * but a string or an array of strings is a promise broken with
     * a TypeError.
     */
    run: (arg0: (string | Array<string>)) => Promise<DjinterpReply>;
    /**
     *           the same, with the reply handed straight back; the port's
     *           own.
     */
    runNow: (arg0: (string | Array<string>)) => DjinterpReply;
    /**
     * hears an event by its name; gives an id for `off`. The
     * program posts "djinterp.set", with the `names` a line's
     * `set` kept, and "djinterp.run", with every line's `line` (or
     * null), `words` (or null for an unclosed quote), and reply.
     */
    on: (arg0: string, arg1: (arg0: object) => (number | void)) => number;
    /**
     * stops hearing.
     */
    off: (arg0: number) => boolean;
};
import * as optionEnv from './option/option_env.js';
import * as djin from './modules/interp/djin.js';
import * as event from './event/event.js';
import * as optionEnvRegistry from './option/option_env_registry.js';
import * as djinterpCommands from './tools/djinterp/djinterp_commands.js';
export { djin, event, optionEnv, optionEnvRegistry };
