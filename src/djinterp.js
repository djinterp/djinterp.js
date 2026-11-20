/*******************************************************************************
* djinterp.js                                                        djinterp.js
*
*   djinterp in a page: what a page imports.
*     import * as djinterp from './src/djinterp.js';
*     const dj = await djinterp.open({ djins: [printer] });
*     await dj.run('set printer.style=json');
*     (await dj.run(['get', '--show-origin', 'printer.style'])).out;
*     dj.on('djinterp.set', (_event) => { ... });
*   `open` makes a program over a registry of settings and a set of djins,
* and readies its settings as the reference's program does at its start:
* the environment's, then the user's settings file's. `run` gives it one
* command line, as a line a person types at a console or as the words
* themselves, and answers with a status, what was written and what was
* said. `on` hears what the program does.
*   A LINE IS A RUN OF THE PROGRAM (the owner's ruling 7 of 2026-11-16).
* The reference's program is a process a command line, so before each
* line the port starts again as a process would: what the last line
* bound from its command line or by `set` is dropped, and the environment
* and the settings file are read again. What `set` kept is in the file,
* and is read from there. What a page bound at the program's standing
* stays. So every line answers as the reference's program answers it,
* and the transcripts of that program are replayed through `run` itself.
*   `open` and `run` answer with promises, as the interface was first
* drawn: what answers a page can then become an engine that is not in
* the page's own thread, and no page changes. With this engine, the port,
* nothing waits, and `openNow` and `runNow` are the same two with the
* answer handed straight back; an engine elsewhere will have neither.
*   The engine is the port: the option machine (src/option), the djin
* records (src/modules/interp), the program's own commands
* (src/tools/djinterp) and the event core (src/event). Nothing here
* decides what a setting accepts or what a command writes.
*
*   Three things are this file's own, since the reference has no page:
*   - A LINE'S WORDS. The reference's program is given its words by a
*     shell. `split` gives a line's words by a small rule of its own, set
*     out there; tools/djinterp_fixture_main.c splits by the same rule
*     when a transcript is recorded.
*   - WHERE SETTINGS ARE KEPT. The reference keeps the user's settings in
*     a file under the user's home. A page gives a FILE object
*     (src/tools/cli/cli_settings.js): `memoryFile` keeps one for as long
*     as the page is open, and `storageFile` keeps one in a Storage the
*     page hands over, such as its localStorage.
*   - WHAT IS HEARD. The reference's program posts no events. `on` hears
*     two, named as the reference names events, by module:
*     "djinterp.run", after every line, and "djinterp.set", after a
*     `set` that was kept.
*   Nothing here touches the document, the window or the network: a page
* hands in what it wants used.
*
*
* path:      /src/djinterp.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  A LINE'S WORDS
    --------------
    1.  split
2.  WHERE SETTINGS ARE KEPT
    -----------------------
    1.  memoryFile
    2.  storageFile
3.  SETTINGS A PAGE DECLARES
    ------------------------
    1.  settingsFrame
4.  THE PROGRAM
    -----------
    1.  openProgram
    2.  openNow
    3.  open
*/

import * as event from './event/event.js';
import * as djin from './modules/interp/djin.js';
import { resultStatus, statusName } from './option/option_common.js';
import * as optionEnv from './option/option_env.js';
import * as optionEnvRegistry from './option/option_env_registry.js';
import * as cliSettings from './tools/cli/cli_settings.js';
import * as djinterpCommands from './tools/djinterp/djinterp_commands.js';

// the types of other modules that this one's comments name
/** @import { DjinRecord } from './modules/interp/djin.js' */
/** @import { DjinSet } from './modules/interp/djin.js' */
/**
 * @import { DjinterpProgram }
 *         from './tools/djinterp/djinterp_commands.js'
 */
/** @import { OptionEnv } from './option/option_env.js' */
/**
 * @import { OptionEnvRegistry }
 *         from './option/option_env_registry.js'
 */
/** @import { OptionRow } from './option/option_env.js' */

export { djin, event, optionEnv, optionEnvRegistry };

const SETTINGS_NAME = 'djinterp/settings';


//==============================================================================
// 1.  A LINE'S WORDS
//==============================================================================

// 1.1
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
export function split(
    _line
)
{
    const words = [];
    let   at    = 0;

    while (at < _line.length)
    {
        while ( (_line[at] === ' ') ||
                (_line[at] === '\t') )
        {
            ++at;
        }

        if (at >= _line.length)
        {
            break;
        }

        let word = '';

        while ( (at < _line.length) &&
                (_line[at] !== ' ') &&
                (_line[at] !== '\t') )
        {
            const quote = _line[at];

            if ( (quote !== '"') &&
                 (quote !== '\'') )
            {
                word += _line[at++];

                continue;
            }

            for (++at; _line[at] !== quote; ++at)
            {
                if (at >= _line.length)
                {
                    return null;
                }

                if ( (quote === '"')       &&
                     (_line[at] === '\\')  &&
                     ( (_line[at + 1] === '"') ||
                       (_line[at + 1] === '\\') ) )
                {
                    ++at;
                }

                word += _line[at];
            }

            ++at;
        }

        words.push(word);
    }

    return words;
}


//==============================================================================
// 2.  WHERE SETTINGS ARE KEPT
//==============================================================================

// 2.1
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
export function memoryFile(
    _name = SETTINGS_NAME,
    _text = null
)
{
    let text = _text;

    return {
        name:  _name,
        read:  () => text,
        write: (_new) =>
        {
            text = _new;
        }
    };
}

// 2.2
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
export function storageFile(
    _storage,
    _key = SETTINGS_NAME
)
{
    if ( (_storage === null)                      ||
         (typeof _storage !== 'object')           ||
         (typeof _storage.getItem !== 'function') ||
         (typeof _storage.setItem !== 'function') )
    {
        throw new TypeError('storageFile: the storage is not a Storage');
    }

    return {
        name:  _key,
        read:  () => _storage.getItem(_key),
        write: (_new) => _storage.setItem(_key, _new)
    };
}


//==============================================================================
// 3.  SETTINGS A PAGE DECLARES
//==============================================================================

// 3.1
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
export function settingsFrame(
    _name,
    _rows,
    _scopes = []
)
{
    const frame = optionEnv.init();
    const must  = (_result, _what) =>
    {
        if (!_result.isOk)
        {
            throw new Error('settingsFrame: ' + _what + ' was refused (' +
                            statusName(resultStatus(_result)) + ')');
        }
    };

    must(optionEnv.setName(frame, _name), 'the name \'' + _name + '\'');

    for (const row of _rows)
    {
        must(optionEnv.declare(frame, row),
             'the row \'' + _name + '.' + row?.name + '\'');
    }

    if (_scopes.length !== 0)
    {
        must(optionEnv.setScopes(frame, _scopes), 'the scopes');
    }

    return frame;
}


//==============================================================================
// 4.  THE PROGRAM
//==============================================================================

/*
takeQuery
  Binds a URL's query as the command line: "name=value" as --set, a bare
"name" as a bool made true and "no-name" as one made false. What is refused
is said as a warning.
*/
function takeQuery(
    _program,
    _query
)
{
    let said = '';

    for (const piece of _query.replace(/^\?/, '').split('&'))
    {
        if (piece.length === 0)
        {
            continue;
        }

        let text;

        try
        {
            text = decodeURIComponent(piece.replace(/\+/g, ' '));
        }
        catch
        {
            said += _program.name + ': warning: query: \'' + piece +
                    '\' is not percent-encoded text\n';

            continue;
        }

        const argv  = text.includes('=') ? ['--set', text]
                                         : ['--' + text];
        const taken = optionEnvRegistry.inner.takeOption(
                          _program.registry, argv, 0);

        if (taken.took <= 0)
        {
            said += _program.name + ': warning: query: ' +
                    cliSettings.saidFor(
                        _program.registry, argv, 0,
                        (taken.result !== null)
                            ? resultStatus(taken.result)
                            : 0) + '\n';
        }
    }

    return said;
}

/**
 * What a line is answered with.
 *
 * @typedef {object} DjinterpReply
 * @property {number} status  the program's exit status for the line: 0,
 *           1 for no, 2 for trouble.
 * @property {string} out  what it wrote.
 * @property {string} err  what it said.
 */

/**
 * An open program. Made by `open`.
 *
 * @typedef {object} DjinterpSession
 * @property {OptionEnvRegistry} registry  its settings.
 * @property {DjinSet} set  its djins.
 * @property {DjinterpProgram} program  the program under it.
 * @property {string} warnings  what was said while its settings were
 *           readied: a line for each statement of the settings file, and
 *           each piece of the query, that was refused.
 * @property {function((string|Array<string>)): Promise<DjinterpReply>}
 *           run  gives the program one command line: a line, which
 *           `split` makes words of, or an array of the words, which are
 *           passed on untouched. What the program says as it starts
 *           again comes first in the reply's `err`. What is heard of the
 *           line has been heard by the time the promise is kept. Anything
 *           but a string or an array of strings is a promise broken with
 *           a TypeError.
 * @property {function((string|Array<string>)): DjinterpReply} runNow
 *           the same, with the reply handed straight back; the port's
 *           own.
 * @property {function(string, function(object): (number|void)): number}
 *           on  hears an event by its name; gives an id for `off`. The
 *           program posts "djinterp.set", with the `names` a line's
 *           `set` kept, and "djinterp.run", with every line's `line` (or
 *           null), `words` (or null for an unclosed quote), and reply.
 * @property {function(number): boolean} off  stops hearing.
 */

// the sources a run of the program binds at, and its end unbinds
const RUN_SOURCES = [optionEnv.SOURCE.ENVIRONMENT, optionEnv.SOURCE.FILE,
                     optionEnv.SOURCE.COMMAND_LINE,
                     optionEnv.SOURCE.OVERRIDE];

// 4.1
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
export function openProgram(
    _program,
    _options = {}
)
{
    const program = _program;
    const events  = event.dispatcherInit();
    const query   = (typeof _options.query === 'string') ? _options.query
                                                         : null;

    /*
    start
      The program's start, as each process of the reference's starts:
    nothing bound but what the page bound at the program's standing, then
    the environment, the settings file, and the query as the command
    line. Gives what was said of the first two, and of the query.
    */
    const start = () =>
    {
        const registry = program.registry;
        const frames   = [optionEnvRegistry.frame(registry)];

        for (let i = 0; i < optionEnvRegistry.count(registry); ++i)
        {
            frames.push(optionEnvRegistry.at(registry, i));
        }

        for (const frame of frames)
        {
            for (const source of RUN_SOURCES)
            {
                optionEnv.unsetSource(frame, source);
            }
        }

        return { said:  djinterpCommands.programStart(program),
                 asked: (query !== null) ? takeQuery(program, query)
                                         : '' };
    };

    const first = start();

    return {
        registry: program.registry,
        set:      program.set,
        program:  program,
        warnings: first.said + first.asked,

        run(_line)
        {
            // a misuse is a promise broken, not a throw past one
            return new Promise((_keep) => _keep(this.runNow(_line)));
        },

        runNow(_line)
        {
            const line  = (typeof _line === 'string') ? _line : null;
            const given = ( Array.isArray(_line) &&
                            _line.every((_word) =>
                                            (typeof _word === 'string')) );

            if ( (line === null) &&
                 !given )
            {
                throw new TypeError('run: neither a line nor an array ' +
                                    'of words');
            }

            const words = (line !== null) ? split(line) : [..._line];
            let   ran;

            // an unclosed quote is found before the program starts
            if (words === null)
            {
                ran = { status: djinterpCommands.EXIT.TROUBLE, out: '',
                        err: program.name +
                             ': error: a quote is not closed\n',
                        set: [] };
            }
            else
            {
                const began = start();

                ran     = djinterpCommands.programRun(
                              program, [program.name, ...words]);
                ran.err = began.said + ran.err;
            }

            const reply = { status: ran.status, out: ran.out, err: ran.err };

            if (ran.set.length !== 0)
            {
                event.dispatcherFire(events,
                                     event.keyOfName('djinterp.set'),
                                     { names: ran.set });
            }

            event.dispatcherFire(events, event.keyOfName('djinterp.run'),
                                 { line: line, words: words, ...reply });

            return reply;
        },

        on(_name, _handler)
        {
            if ( (typeof _name !== 'string') ||
                 (typeof _handler !== 'function') )
            {
                throw new TypeError('on: a name and a function are needed');
            }

            return event.dispatcherBind(
                       events, event.keyOfName(_name),
                       event.stepMake((_payload) =>
                       {
                           // a handler that gives nothing lets the event
                           // pass on
                           const verdict = /** @type {number | undefined} */
                                           (_handler(_payload));

                           return event.verdictIsConsumed(
                                      verdict ?? event.VERDICT.PASS)
                                      ? event.VERDICT.CONSUME
                                      : event.VERDICT.PASS;
                       })).id;
        },

        off(_id)
        {
            return (event.dispatcherUnbind(events, _id) ===
                    event.STATUS.OK);
        }
    };
}

// 4.2
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
export function openNow(
    _options = {}
)
{
    const registry = optionEnvRegistry.init('djinterp').registry;
    const root     = optionEnvRegistry.frame(registry);
    const must     = (_ok, _what, _why) =>
    {
        if (!_ok)
        {
            throw new Error('djinterp.open: ' + _what + ' was refused (' +
                            _why + ')');
        }
    };

    for (const row of (_options.settings ?? []))
    {
        const declared = optionEnv.declare(root, row);

        must(declared.isOk, 'the setting \'' + row?.name + '\'',
             statusName(resultStatus(declared)));
    }

    if ((_options.scopes ?? []).length !== 0)
    {
        const named = optionEnv.setScopes(root, _options.scopes);

        must(named.isOk, 'the scopes', statusName(resultStatus(named)));
    }

    const program = djinterpCommands.programMake({
        registry:    registry,
        file:        (_options.file === undefined) ? memoryFile()
                                                   : _options.file,
        environment: _options.environment ?? null
    });

    for (const frame of (_options.frames ?? []))
    {
        const added = optionEnvRegistry.add(registry, frame);

        must(added.isOk,
             'the frame \'' + optionEnv.name(frame) + '\'',
             statusName(resultStatus(added)));
    }

    for (const record of (_options.djins ?? []))
    {
        const status = djin.register(program.set, record);

        must(status === djin.STATUS.OK, 'the djin \'' + record?.name + '\'',
             djin.statusName(status));
    }

    return openProgram(program, { query: _options.query });
}

// 4.3
/**
 * Opens a program, as `openNow` does, and answers with a promise of it:
 * the interface a page is written to, whatever engine answers it.
 *
 * @param {object} [_options]  as `openNow` takes them.
 * @returns {Promise<DjinterpSession>}  broken with an Error for a row
 *          or a djin the reference refuses.
 */
export function open(
    _options = {}
)
{
    return new Promise((_keep) => _keep(openNow(_options)));
}
