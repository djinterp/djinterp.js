/*******************************************************************************
* djinterp.js                                                        djinterp.js
*
*   djinterp in a page: what a page imports.
*     import * as djinterp from './src/djinterp.js';
*     const dj = await djinterp.open({ djins: [printer] });
*     await dj.run('set printer.style=json');
*     (await dj.run('get --show-origin printer.style')).out;
*     dj.on('set', (_event) => { ... });
*   `open` makes a program over a registry of settings and a set of djins,
* and readies its settings as the reference's program does at its start:
* the environment's, then the user's settings file's. `run` gives it one
* line, as a person types one at a console, and answers with a status,
* what was written and what was said. `on` hears what the program does.
*   `open` and `run` answer with promises, as the interface was first
* drawn: what answers a page can then become an engine that is not in
* the page's own thread, and no page changes. With this engine, the port,
* nothing waits, and `open_now` and `run_now` are the same two with the
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
*     (src/tools/cli/cli_settings.js): `memory_file` keeps one for as long
*     as the page is open, and `storage_file` keeps one in a Storage the
*     page hands over, such as its localStorage.
*   - WHAT IS HEARD. The reference's program posts no events. `on` hears
*     two: 'run', after every line, and 'set', after a `set` that was
*     kept.
*   Nothing here touches the document, the window or the network: a page
* hands in what it wants used.
*
*
* path:      /src/djinterp.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  A line's words
    1.  split
2.  Where settings are kept
    1.  memory_file
    2.  storage_file
3.  Settings a page declares
    1.  settings_frame
4.  The program
    1.  open_now
    2.  open
*/

import * as event from './event/event.js';
import * as djin from './modules/interp/djin.js';
import { result_status, status_name } from './option/option_common.js';
import * as option_env from './option/option_env.js';
import * as option_env_registry from './option/option_env_registry.js';
import * as cli_settings from './tools/cli/cli_settings.js';
import * as djinterp_commands from './tools/djinterp/djinterp_commands.js';

export { djin, event, option_env, option_env_registry };

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
export function memory_file(
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
export function storage_file(
    _storage,
    _key = SETTINGS_NAME
)
{
    if ( (_storage === null)                      ||
         (typeof _storage !== 'object')           ||
         (typeof _storage.getItem !== 'function') ||
         (typeof _storage.setItem !== 'function') )
    {
        throw new TypeError('storage_file: the storage is not a Storage');
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
 * @param {Array<option_row>} _rows    its rows.
 * @param {Array<string>}     [_scopes=[]]  its scopes' names.
 * @returns {option_env} the frame.
 */
export function settings_frame(
    _name,
    _rows,
    _scopes = []
)
{
    const frame = option_env.init();
    const must  = (_result, _what) =>
    {
        if (!_result.is_ok)
        {
            throw new Error('settings_frame: ' + _what + ' was refused (' +
                            status_name(result_status(_result)) + ')');
        }
    };

    must(option_env.set_name(frame, _name), 'the name \'' + _name + '\'');

    for (const row of _rows)
    {
        must(option_env.declare(frame, row),
             'the row \'' + _name + '.' + row?.name + '\'');
    }

    if (_scopes.length !== 0)
    {
        must(option_env.set_scopes(frame, _scopes), 'the scopes');
    }

    return frame;
}


//==============================================================================
// 4.  THE PROGRAM
//==============================================================================

/*
take_query
  Binds a URL's query as the command line: "name=value" as --set, a bare
"name" as a bool made true and "no-name" as one made false. What is refused
is said as a warning.
*/
function take_query(
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
        const taken = option_env_registry.inner.take_option(
                          _program.registry, argv, 0);

        if (taken.took <= 0)
        {
            said += _program.name + ': warning: query: ' +
                    cli_settings.said_for(
                        _program.registry, argv, 0,
                        (taken.result !== null)
                            ? result_status(taken.result)
                            : 0) + '\n';
        }
    }

    return said;
}

/**
 * What a line is answered with.
 *
 * @typedef {object} djinterp_reply
 * @property {number} status  the program's exit status for the line: 0,
 *           1 for no, 2 for trouble.
 * @property {string} out  what it wrote.
 * @property {string} err  what it said.
 */

/**
 * An open program. Made by `open`.
 *
 * @typedef {object} djinterp_session
 * @property {option_env_registry} registry  its settings.
 * @property {djin_set} set  its djins.
 * @property {string} warnings  what was said while its settings were
 *           readied: a line for each statement of the settings file, and
 *           each piece of the query, that was refused.
 * @property {function(string): Promise<djinterp_reply>} run  gives the
 *           program one line. What is heard of the line has been heard
 *           by the time the promise is kept. A line that is not a string
 *           is a promise broken with a TypeError.
 * @property {function(string): djinterp_reply} run_now  the same, with
 *           the reply handed straight back; the port's own.
 * @property {function(string, function(object): (number|void)): number}
 *           on  hears an event; gives an id for `off`.
 * @property {function(number): boolean} off  stops hearing.
 */

// 4.1
/**
 * Opens a program: a registry named "djinterp", the djins given, and the
 * settings of a run readied -- the environment's, the settings file's,
 * and the query's, each bound as the source it is. One call is one run of
 * the reference's program from its start; `run` then gives it lines, and
 * what one line binds stays bound for the next.
 *
 * @param {object} [_options]  what the program is made of.
 * @param {Array<option_row>} [_options.settings=[]]  the program's own
 *        settings: the registry's root's.
 * @param {Array<string>} [_options.scopes=[]]  the root's scopes.
 * @param {Array<djin_record>} [_options.djins=[]]  its djins.
 * @param {Array<option_env>} [_options.frames=[]]  named frames of
 *        settings with no djin's record.
 * @param {?object} [_options.file]  the user's settings file; one in
 *        memory where left out, none for null: `set` then binds for the
 *        run and says it has nowhere to keep what it set.
 * @param {*} [_options.environment=null]  the environment, as
 *        `option_env.import` takes one: `DJINTERP_PRINTER_STYLE` names
 *        `printer.style`.
 * @param {?string} [_options.query=null]  a URL's query, such as
 *        `location.search`, bound as the command line.
 * @returns {djinterp_session}
 * @throws {Error} for a row or a djin the reference refuses: the page's
 *         own mistake.
 */
export function open_now(
    _options = {}
)
{
    const registry = option_env_registry.init('djinterp').registry;
    const root     = option_env_registry.frame(registry);
    const events   = event.dispatcher_init();
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
        const declared = option_env.declare(root, row);

        must(declared.is_ok, 'the setting \'' + row?.name + '\'',
             status_name(result_status(declared)));
    }

    if ((_options.scopes ?? []).length !== 0)
    {
        const named = option_env.set_scopes(root, _options.scopes);

        must(named.is_ok, 'the scopes', status_name(result_status(named)));
    }

    const program = djinterp_commands.program_make({
        registry:    registry,
        file:        (_options.file === undefined) ? memory_file()
                                                   : _options.file,
        environment: _options.environment ?? null
    });

    for (const frame of (_options.frames ?? []))
    {
        const added = option_env_registry.add(registry, frame);

        must(added.is_ok,
             'the frame \'' + option_env.name(frame) + '\'',
             status_name(result_status(added)));
    }

    for (const record of (_options.djins ?? []))
    {
        const status = djin.register(program.set, record);

        must(status === djin.STATUS.OK, 'the djin \'' + record?.name + '\'',
             djin.status_name(status));
    }

    let warnings = djinterp_commands.program_start(program);

    if (typeof _options.query === 'string')
    {
        warnings += take_query(program, _options.query);
    }

    return {
        registry: registry,
        set:      program.set,
        program:  program,
        warnings: warnings,

        run(_line)
        {
            // a misuse is a promise broken, not a throw past one
            return new Promise((_keep) => _keep(this.run_now(_line)));
        },

        run_now(_line)
        {
            if (typeof _line !== 'string')
            {
                throw new TypeError('run: the line is not a string');
            }

            const words = split(_line);
            const ran   = (words === null)
                ? { status: djinterp_commands.EXIT.TROUBLE, out: '',
                    err: program.name + ': error: a quote is not closed\n',
                    set: [] }
                : djinterp_commands.program_run(program,
                                                [program.name, ...words]);
            const reply = { status: ran.status, out: ran.out, err: ran.err };

            if (ran.set.length !== 0)
            {
                event.dispatcher_fire(events, event.key_of_name('set'),
                                      { names: ran.set });
            }

            event.dispatcher_fire(events, event.key_of_name('run'),
                                  { line: _line, ...reply });

            return reply;
        },

        on(_name, _handler)
        {
            if ( (typeof _name !== 'string') ||
                 (typeof _handler !== 'function') )
            {
                throw new TypeError('on: a name and a function are needed');
            }

            return event.dispatcher_bind(
                       events, event.key_of_name(_name),
                       event.step_make((_payload) =>
                           (event.verdict_is_consumed(_handler(_payload))
                                ? event.VERDICT.CONSUME
                                : event.VERDICT.PASS))).id;
        },

        off(_id)
        {
            return (event.dispatcher_unbind(events, _id) ===
                    event.STATUS.OK);
        }
    };
}

// 4.2
/**
 * Opens a program, as `open_now` does, and answers with a promise of it:
 * the interface a page is written to, whatever engine answers it.
 *
 * @param {object} [_options]  as `open_now` takes them.
 * @returns {Promise<djinterp_session>}  broken with an Error for a row
 *          or a djin the reference refuses.
 */
export function open(
    _options = {}
)
{
    return new Promise((_keep) => _keep(open_now(_options)));
}
