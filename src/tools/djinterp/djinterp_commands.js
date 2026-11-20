/*******************************************************************************
* djinterp.js [djinterp]                                    djinterp_commands.js
*
*   The djinterp program's own commands, over a registry and a set of
* djins: `list`, `describe DJIN`, `get [--show-origin] [NAME]...` and
* `set NAME=VALUE...`. They are what a page's console and settings panel
* talk to. What each writes, and what it says when it refuses, is the
* reference's, byte for byte; the transcripts under tests/transcripts
* named program_* hold the reference's program doing the same.
*   A run answers with a status and two texts, what was written and what
* was said, where the reference has an exit status and two streams.
*
*   The reference's program reads its command line with djinterp's
* argument parser and its command-line kit. Neither is ported. This file
* reads the four commands' own arguments itself, and says what the parser
* says for a missing command, a word that is no command, an argument a
* command does not expect and one it requires. What the kit adds to every
* program -- `help`, `completion`, `--help`, `--version`, `-q`, `-v`,
* `--color`, and "did you mean" for a mistyped command -- is not here
* (HANDOFF.md, "what is not ported").
*   reference: src/djinterp/tools/djinterp/djinterp_commands.c, at d20c0b23
*
*
* path:      /src/tools/djinterp/djinterp_commands.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The program
    1.  EXIT, RESERVED, COMMANDS
    2.  program_make
    3.  program_start
2.  Running
    1.  program_run
*/

import * as djin from '../../modules/interp/djin.js';
import { STATUS, result_status } from '../../option/option_common.js';
import * as option_env from '../../option/option_env.js';
import * as option_env_registry from '../../option/option_env_registry.js';
import { format_real } from '../../text/real_format.js';
import { decode, encode } from '../../text/utf8.js';
import * as cli_settings from '../cli/cli_settings.js';

const ROOM      = 512;
const env_bytes = option_env.bytes;
const reg_bytes = option_env_registry.bytes;
const KIND      = option_env.KIND;
const SOURCE    = option_env.SOURCE;


//==============================================================================
// 1.  THE PROGRAM
//==============================================================================

// 1.1
/**
 * What a run answers with: the kit's exit statuses.
 */
export const EXIT = Object.freeze({ OK: 0, NO: 1, TROUBLE: 2 });

/**
 * The names the program keeps for its own commands, and the kit's: no djin
 * may be named one.
 */
export const RESERVED = Object.freeze(['list', 'describe', 'get', 'set',
                                       'help', 'completion']);

/**
 * The commands this port has.
 */
export const COMMANDS = Object.freeze(['list', 'describe', 'get', 'set']);

/**
 * A program: a registry, the djins over it, and where its settings come
 * from. Made by `program_make`.
 *
 * @typedef {object} djinterp_program
 * @property {string} name  what it calls itself when it speaks.
 * @property {option_env_registry} registry  its settings.
 * @property {djin_set} set  its djins.
 * @property {?object} file  the user's settings file
 *           (src/tools/cli/cli_settings.js), or null for none.
 * @property {*} environment  the environment, as `option_env.import`
 *           takes one.
 */

// 1.2
/**
 * A program over a registry.
 *
 * @param {object} _options  what it is made over.
 * @param {option_env_registry} _options.registry  its registry.
 * @param {?object} [_options.file=null]  the user's settings file.
 * @param {*} [_options.environment=null]  the environment.
 * @param {number} [_options.djins=16]  the most djins its set holds; the
 *        reference's program holds 16.
 * @returns {djinterp_program}
 */
export function program_make(
    _options
)
{
    return {
        name:        'djinterp',
        registry:    _options.registry,
        set:         djin.set_init({ capacity: _options.djins ?? 16,
                                     registry: _options.registry,
                                     reserved: RESERVED }),
        file:        _options.file ?? null,
        environment: _options.environment ?? null
    };
}

// 1.3
/**
 * Readies the program's settings for a run, once: the environment's and
 * the user's file's (`cli_settings.start`).
 *
 * @param {djinterp_program} _program  the program.
 * @returns {string} what was said of the file's statements that were
 *          refused: a warning a line.
 */
export function program_start(
    _program
)
{
    return decode(cli_settings.start(_program));
}


//==============================================================================
// WHAT A COMMAND SAYS
//==============================================================================

/*
report
  An error, as the kit reports one: "djinterp: error: MESSAGE".
*/
function report(
    _run,
    _message
)
{
    _run.err += _run.program.name + ': error: ' + _message + '\n';

    return EXIT.TROUBLE;
}

/*
usage_error
  An error of how the program was called, as the kit says one: the command
before the message where there is one, and where to read more.
*/
function usage_error(
    _run,
    _command,
    _message
)
{
    const name = _run.program.name;

    _run.err += name + ': error: ' +
                ((_command !== null) ? (_command + ': ') : '') + _message +
                '\nTry \'' + name +
                ((_command !== null) ? (' ' + _command) : '') +
                ' --help\' for more information.\n';

    return EXIT.TROUBLE;
}


//==============================================================================
// LIST AND DESCRIBE
//==============================================================================

function work_list(
    _run
)
{
    _run.out += djin.bytes.list(_run.program.set);

    return EXIT.OK;
}

function work_describe(
    _run,
    _names
)
{
    if (_names.length === 0)
    {
        return usage_error(_run, 'describe', 'DJIN is required');
    }

    const found = djin.bytes.find(_run.program.set, _names[0]);
    const frame = (found === null)
                      ? reg_bytes.find(_run.program.registry, _names[0])
                      : null;

    if ( (found === null) &&
         (frame === null) )
    {
        return usage_error(_run, 'describe',
                           'no djin is named \'' + _names[0] + '\'');
    }

    _run.out += (found !== null) ? djin.bytes.description(found)
                                 : djin.bytes.frame(frame);

    return EXIT.OK;
}


//==============================================================================
// GET
//==============================================================================

/*
find
  A setting by its full name: its frame, scope, variable and row; null for
none. A djin's setting is looked for by its whole name, then by what
follows the djin's.
*/
function find(
    _registry,
    _name
)
{
    const frame = reg_bytes.target(_registry, _name);
    const dot   = _name.indexOf('.');

    if (frame === null)
    {
        return null;
    }

    let found = env_bytes.resolve(frame, _name);

    if ( !found.is_ok &&
         (dot >= 0)   &&
         (frame !== option_env_registry.frame(_registry)) )
    {
        found = env_bytes.resolve(frame, _name.slice(dot + 1));
    }

    const decl = found.is_ok ? env_bytes.decl(frame, found.value) : null;

    return (decl !== null) ? { frame: frame, scope: found.scope,
                               var: found.value, decl: decl }
                           : null;
}

function source_word(
    _source
)
{
    switch (_source)
    {
        case SOURCE.PROGRAM:      return 'program';
        case SOURCE.FILE:         return 'file';
        case SOURCE.ENVIRONMENT:  return 'environment';
        case SOURCE.COMMAND_LINE: return 'command line';
        case SOURCE.OVERRIDE:     return 'override';
        default:                  return 'default';
    }
}

/*
value_text
  A value as an origin's line shows it: a TEXT in quotes, as it is, or
"unset"; an integer by the last of the row's names that has its value.
*/
function value_text(
    _decl,
    _text,
    _integer,
    _real,
    _negative_nan
)
{
    let named = null;
    let out;

    for (let i = 0; (_decl.names !== null) && (i < _decl.name_count); ++i)
    {
        named = (_decl.names[i].value === _integer) ? _decl.names[i].name
                                                    : named;
    }

    switch (_decl.kind)
    {
        case KIND.BOOL:
            out = (_integer !== 0n) ? 'true' : 'false';
            break;

        case KIND.REAL:
            out = format_real(_real, _negative_nan);
            break;

        case KIND.TEXT:
            out = (_text !== null) ? ('"' + _text + '"') : 'unset';
            break;

        default:
            out = (named !== null) ? named : _integer.toString();
            break;
    }

    return out.slice(0, ROOM - 1);
}

/*
origins
  What lies under a setting's value in force: each other binding that
bears, then the row's default.
*/
function origins(
    _setting
)
{
    const found = env_bytes.layers(_setting.frame, _setting.scope,
                                   _setting.var, 8);
    const shown = (found === null) ? 0 : Math.min(found.count, 8);
    const decl  = _setting.decl;
    let   out   = '';

    for (let i = 1; i < shown; ++i)
    {
        const value = found.layers[i].value;

        out += ('    under it   ' +
                value_text(decl, value.text, value.integer, value.real,
                           value.negative_nan) +
                '   (' + source_word(value.source) + ')\n')
                   .slice(0, (ROOM * 2) - 1);
    }

    if (shown > 0)
    {
        out += ('    default    ' +
                value_text(decl, decl.text, decl.integer, decl.real,
                           decl.negative_nan) +
                '   (' + ((decl.knob !== null) ? decl.knob : 'default') +
                ')\n').slice(0, (ROOM * 2) - 1);
    }

    return out;
}

/*
get_one
  One setting as a statement that loads back, or a comment for a TEXT that
is unset; with its origin, where asked: who set it, and what lies under.
*/
function get_one(
    _name,
    _setting,
    _origin
)
{
    const in_force = env_bytes.get(_setting.frame, _setting.scope,
                                   _setting.var).got;
    const unset    = ( (_setting.decl.kind === KIND.TEXT) &&
                       (in_force.text === null) );
    const value    = env_bytes.format_quoted(_setting.frame, _setting.scope,
                                             _setting.var)
                         .slice(0, ROOM - 1);
    const room     = ROOM * 2;
    let   line     = (unset ? ('# ' + _name + ' is unset')
                            : (_name + ' = ' + value)).slice(0, room - 1);

    if (_origin)
    {
        line = (line + '  (' +
                (in_force.bound ? source_word(in_force.source)
                                : (_setting.decl.knob !== null)
                                      ? _setting.decl.knob
                                      : 'default') +
                ')').slice(0, room - 2);
    }

    return line + '\n' +
           ( (_origin && in_force.bound) ? origins(_setting) : '' );
}

/*
get_frame
  Every setting a frame declares, by its full name.
*/
function get_frame(
    _run,
    _frame,
    _root,
    _origin
)
{
    for (const decl of _frame.vars)
    {
        const name = _root ? decl.name : (_frame.name + '.' + decl.name);

        if ( (name.length > 0) &&
             (name.length < ROOM) )
        {
            const setting = find(_run.program.registry, name);

            if (setting !== null)
            {
                _run.out += get_one(name, setting, _origin);
            }
        }
    }

    return;
}

function work_get(
    _run,
    _names,
    _origin
)
{
    const registry = _run.program.registry;
    let   status   = EXIT.OK;

    if (_names.length === 0)
    {
        get_frame(_run, option_env_registry.frame(registry), true, _origin);

        for (let i = 0; i < option_env_registry.count(registry); ++i)
        {
            get_frame(_run, option_env_registry.at(registry, i), false,
                      _origin);
        }
    }

    for (const name of _names)
    {
        const setting = find(registry, name);

        if (setting !== null)
        {
            _run.out += get_one(name, setting, _origin);

            continue;
        }

        status = report(_run, cli_settings.why(registry, STATUS.KEY_ABSENT,
                                               name, null, ROOM));
    }

    return status;
}


//==============================================================================
// SET
//==============================================================================

/*
bind
  Binds each NAME=VALUE for the run, as an override; false where one is not
of that shape or is refused, each said.
*/
function bind(
    _run,
    _items
)
{
    let held = true;

    for (const item of _items)
    {
        const equals = item.indexOf('=');

        if (equals <= 0)
        {
            usage_error(_run, 'set', '\'' + item + '\' is not NAME=VALUE');
            held = false;

            continue;
        }

        const name  = item.slice(0, equals);
        const value = item.slice(equals + 1);
        const bound = reg_bytes.assign(_run.program.registry, name, value,
                                       SOURCE.OVERRIDE);

        if (!bound.is_ok)
        {
            report(_run, cli_settings.why(_run.program.registry,
                                          result_status(bound), name,
                                          value.slice(0, ROOM - 1), ROOM));
            held = false;
        }
    }

    return held;
}

/*
sets_alone
  Whether a line of the settings file is one statement that sets a name
and nothing else: the line a new value for the name replaces.
*/
function sets_alone(
    _line,
    _name
)
{
    const length = _line.length;
    let   at     = 0;

    while ( (at < length) &&
            ( (_line[at] === ' ') ||
              (_line[at] === '\t') ) )
    {
        ++at;
    }

    if (!_line.startsWith(_name, at))
    {
        return false;
    }

    at += _name.length;

    while ( (at < length) &&
            ( (_line[at] === ' ') ||
              (_line[at] === '\t') ) )
    {
        ++at;
    }

    return ( (at < length)                &&
             (_line[at] === '=')          &&
             !_line.includes(';', at)     &&
             !_line.includes('#', at) );
}

/*
compose
  The settings file's new text: its old lines, less each that set alone a
name now given, then a statement for each name given, its value as it is
in force and written so that it loads back. Null where the text does not
fit the room the reference gives it.
*/
function compose(
    _registry,
    _old,
    _items
)
{
    const names    = _items.map((_item) =>
                                    _item.slice(0, _item.indexOf('=')));
    const capacity = _old.length + ((_items.length + 1) * ROOM);
    let   out      = '';

    for (let at = 0; at < _old.length; )
    {
        const end  = _old.indexOf('\n', at);
        const line = _old.slice(at, (end >= 0) ? end : _old.length);

        if (!names.some((_name) => sets_alone(line, _name)))
        {
            if (out.length + line.length + 1 >= capacity)
            {
                return null;
            }

            out += line + '\n';
        }

        at += line.length + 1;
    }

    for (const name of names)
    {
        const setting = find(_registry, name);
        const text    = name + ' = ' +
                        env_bytes.format_quoted(setting.frame, setting.scope,
                                                setting.var)
                            .slice(0, ROOM - 1) + '\n';

        if (text.length >= capacity - out.length)
        {
            return null;
        }

        out += text;
    }

    return out;
}

function work_set(
    _run,
    _items
)
{
    const file = _run.program.file;

    if (!bind(_run, _items))
    {
        return EXIT.TROUBLE;
    }

    if (file === null)
    {
        return report(_run, 'the system names no home for the settings ' +
                            'file');
    }

    const said = (_doing, _error) =>
        report(_run, 'cannot ' + _doing + ' \'' + encode(file.name) +
                     '\': ' + encode(String(_error?.message ?? _error)));
    let   old;

    try
    {
        old = file.read();
    }
    catch (error)
    {
        return said('read', error);
    }

    const text = compose(_run.program.registry,
                         (typeof old === 'string') ? encode(old) : '',
                         _items);

    if (text === null)
    {
        return report(_run, 'out of memory');
    }

    try
    {
        file.write(decode(text));
    }
    catch (error)
    {
        return said('write', error);
    }

    return EXIT.OK;
}


//==============================================================================
// 2.  RUNNING
//==============================================================================

/*
unexpected
  The usage error for the first argument a command does not expect.
*/
function unexpected(
    _run,
    _command,
    _argument
)
{
    return usage_error(_run, _command,
                       'the following argument was not expected: ' +
                       _argument);
}

function run_bytes(
    _program,
    _argv
)
{
    const run   = { program: _program, out: '', err: '' };
    const taken = cli_settings.take(_program.registry, _argv, COMMANDS);

    if (taken.refused !== null)
    {
        usage_error(run, taken.refused.command, taken.refused.message);

        return { status: EXIT.TROUBLE, out: run.out, err: run.err };
    }

    const [, command, ...rest] = taken.kept;
    const options              = rest.filter((_a) => _a.startsWith('-'));
    const operands             = rest.filter((_a) => !_a.startsWith('-'));
    let   status;

    if (command === undefined)
    {
        run.err += _program.name + ': error: a command is required\n' +
                   'Usage: ' + _program.name +
                   ' [OPTION]... COMMAND [ARGUMENT]...\n' +
                   'Commands: ' + COMMANDS.join(', ') + '\n' +
                   'Try \'' + _program.name +
                   ' --help\' for more information.\n';
        status   = EXIT.TROUBLE;
    }
    else if (command.startsWith('-'))
    {
        status = unexpected(run, null, command);
    }
    else if (!COMMANDS.includes(command))
    {
        status = usage_error(run, null,
                             '\'' + command + '\' is not a command');
    }
    else if (command === 'list')
    {
        status = (rest.length !== 0) ? unexpected(run, command, rest[0])
                                     : work_list(run);
    }
    else if (command === 'describe')
    {
        status = (options.length !== 0)
                     ? unexpected(run, command, options[0])
               : (operands.length > 1)
                     ? unexpected(run, command, operands[1])
               : work_describe(run, operands);
    }
    else if (command === 'get')
    {
        const stray = options.filter((_a) => (_a !== '--show-origin'));

        status = (stray.length !== 0)
                     ? unexpected(run, command, stray[0])
                     : work_get(run, operands, (options.length !== 0));
    }
    else
    {
        status = (options.length !== 0)
                     ? unexpected(run, command, options[0])
               : (operands.length === 0)
                     ? usage_error(run, command, 'SETTING is required')
               : work_set(run, operands);
    }

    return { status: status, out: run.out, err: run.err };
}

// 2.1
/**
 * Runs the program on a command line.
 *
 * @param {djinterp_program} _program  the program.
 * @param {Array<string>}    _argv     the command line's words, the
 *        program's name first: ['djinterp', 'get', 'printer.style'].
 * @returns {{status: number, out: string, err: string}} an EXIT status;
 *          what the command wrote; and what it said, which is empty for
 *          a run with no trouble.
 */
export function program_run(
    _program,
    _argv
)
{
    const ran = run_bytes(_program,
                          _argv.map((_word) => env_bytes.cstr(encode(_word))));

    return { status: ran.status, out: decode(ran.out), err: decode(ran.err) };
}
