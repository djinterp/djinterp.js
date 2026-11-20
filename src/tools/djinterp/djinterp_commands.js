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
* is a model of what the two do for this program, written from their
* source and held to the reference by a fuzzer that gives every word the
* program takes (tools/fuzz_program.js): a missing command, a word that
* is no command, arguments a command does not expect and one it requires,
* the parser's "did you mean", `--`, and what the kit adds to every
* program -- `help`, `completion`, `--help`, `--version`, `-q`, `-v` and
* `--color`. Help's texts, the version and the completion scripts are
* the reference's own, generated as data (generated/kit.json).
*   One thing is not modelled: `--version` at `-v`, which names the file
* and the compiler of the reference's own build (HANDOFF.md, "what is not
* ported").
*   reference: src/djinterp/tools/djinterp/djinterp_commands.c, at 3eb096c9
*
*
* path:      /src/tools/djinterp/djinterp_commands.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The program
    1.  EXIT, RESERVED, COMMANDS
    2.  programMake
    3.  programStart
2.  Running
    1.  programRun
*/

import kit from '../../../generated/kit.js';
import * as djin from '../../modules/interp/djin.js';
import { STATUS, resultStatus } from '../../option/option_common.js';
import * as optionEnv from '../../option/option_env.js';
import * as optionEnvRegistry from '../../option/option_env_registry.js';
import { formatReal } from '../../text/real_format.js';
import * as cliSettings from '../cli/cli_settings.js';
import { cutAt } from '../../text/cut.js';

// the types of other modules that this one's comments name
/** @import { DjinSet } from '../../modules/interp/djin.js' */
/** @import { OptionEnvRegistry } from '../../option/option_env_registry.js' */

const ROOM     = 512;
const envInner = optionEnv.inner;
const regInner = optionEnvRegistry.inner;
const KIND     = optionEnv.KIND;
const SOURCE   = optionEnv.SOURCE;


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

// 1.2
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
export function programMake(
    _options
)
{
    return {
        name:        'djinterp',
        registry:    _options.registry,
        set:         djin.setInit({ capacity: _options.djins ?? 16,
                                    registry: _options.registry,
                                    reserved: RESERVED }),
        file:        _options.file ?? null,
        environment: _options.environment ?? null
    };
}

// 1.3
/**
 * Readies the program's settings for a run, once: the environment's and
 * the user's file's (`cliSettings.start`).
 *
 * @param {DjinterpProgram} _program  the program.
 * @returns {string} what was said of the file's statements that were
 *          refused: a warning a line.
 */
export function programStart(
    _program
)
{
    return cliSettings.start(_program);
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
usageError
  An error of how the program was called, as the kit says one: the command
before the message where there is one, the parser's suggestions as notes,
and where to read more.
*/
function usageError(
    _run,
    _command,
    _message,
    _notes = []
)
{
    const name = _run.program.name;

    _run.err += name + ': error: ' +
                ((_command !== null) ? (_command + ': ') : '') + _message +
                _notes.map((_note) => ('\n' + name + ': note: ' + _note))
                      .join('') +
                '\nTry \'' + name +
                ((_command !== null) ? (' ' + _command) : '') +
                ' --help\' for more information.\n';

    return EXIT.TROUBLE;
}


//==============================================================================
// LIST AND DESCRIBE
//==============================================================================

function workList(
    _run
)
{
    _run.out += djin.inner.list(_run.program.set);

    return EXIT.OK;
}

function workDescribe(
    _run,
    _names
)
{
    const found = djin.inner.find(_run.program.set, _names[0]);
    const frame = (found === null)
                      ? regInner.find(_run.program.registry, _names[0])
                      : null;

    if ( (found === null) &&
         (frame === null) )
    {
        return usageError(_run, 'describe',
                          'no djin is named \'' + _names[0] + '\'');
    }

    _run.out += (found !== null) ? djin.inner.description(found)
                                 : djin.inner.frame(frame);

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
    const frame = regInner.target(_registry, _name);
    const dot   = _name.indexOf('.');

    if (frame === null)
    {
        return null;
    }

    let found = envInner.resolve(frame, _name);

    if ( !found.isOk &&
         (dot >= 0)  &&
         (frame !== optionEnvRegistry.frame(_registry)) )
    {
        found = envInner.resolve(frame, _name.slice(dot + 1));
    }

    const decl = found.isOk ? envInner.decl(frame, found.value) : null;

    return (decl !== null) ? { frame: frame, scope: found.scope,
                               var: found.value, decl: decl }
                           : null;
}

function sourceWord(
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
valueText
  A value as an origin's line shows it: a TEXT in quotes, as it is, or
"unset"; an integer by the last of the row's names that has its value.
*/
function valueText(
    _decl,
    _text,
    _integer,
    _real
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
            out = formatReal(_real);
            break;

        case KIND.TEXT:
            out = (_text !== null) ? ('"' + _text + '"') : 'unset';
            break;

        default:
            out = (named !== null) ? named : _integer.toString();
            break;
    }

    return cutAt(out, ROOM - 1);
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
    const found = envInner.layers(_setting.frame, _setting.scope,
                                  _setting.var, 8);
    const shown = (found === null) ? 0 : Math.min(found.count, 8);
    const decl  = _setting.decl;
    let   out   = '';

    for (let i = 1; i < shown; ++i)
    {
        const value = found.layers[i].value;

        out += ('    under it   ' +
                valueText(decl, value.text, value.integer, value.real) +
                '   (' + sourceWord(value.source) + ')\n')
                   .slice(0, (ROOM * 2) - 1);
    }

    if (shown > 0)
    {
        out += ('    default    ' +
                valueText(decl, decl.text, decl.integer, decl.real) +
                '   (' + ((decl.knob !== null) ? decl.knob : 'default') +
                ')\n').slice(0, (ROOM * 2) - 1);
    }

    return out;
}

/*
getOne
  One setting as a statement that loads back, or a comment for a TEXT that
is unset; with its origin, where asked: who set it, and what lies under.
*/
function getOne(
    _name,
    _setting,
    _origin
)
{
    const inForce = envInner.get(_setting.frame, _setting.scope,
                                 _setting.var).got;
    const unset    = ( (_setting.decl.kind === KIND.TEXT) &&
                       (inForce.text === null) );
    const value    = cutAt(envInner.formatQuoted(_setting.frame,
                                                 _setting.scope,
                                                 _setting.var), ROOM - 1);
    const room     = ROOM * 2;
    let   line     = cutAt(unset ? ('# ' + _name + ' is unset')
                                 : (_name + ' = ' + value), room - 1);

    if (_origin)
    {
        line = cutAt(line + '  (' +
                     (inForce.bound ? sourceWord(inForce.source)
                                    : (_setting.decl.knob !== null)
                                          ? _setting.decl.knob
                                          : 'default') +
                     ')', room - 2);
    }

    return line + '\n' +
           ( (_origin && inForce.bound) ? origins(_setting) : '' );
}

/*
getFrame
  Every setting a frame declares, by its full name.
*/
function getFrame(
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
                _run.out += getOne(name, setting, _origin);
            }
        }
    }

    return;
}

function workGet(
    _run,
    _names,
    _origin
)
{
    const registry = _run.program.registry;
    /** @type {number} */
    let   status   = EXIT.OK;

    if (_names.length === 0)
    {
        getFrame(_run, optionEnvRegistry.frame(registry), true, _origin);

        for (let i = 0; i < optionEnvRegistry.count(registry); ++i)
        {
            getFrame(_run, optionEnvRegistry.at(registry, i), false,
                     _origin);
        }
    }

    for (const name of _names)
    {
        const setting = find(registry, name);

        if (setting !== null)
        {
            _run.out += getOne(name, setting, _origin);

            continue;
        }

        status = report(_run, cliSettings.why(registry, STATUS.KEY_ABSENT,
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
            usageError(_run, 'set', '\'' + item + '\' is not NAME=VALUE');
            held = false;

            continue;
        }

        const name  = item.slice(0, equals);
        const value = item.slice(equals + 1);
        const bound = regInner.assign(_run.program.registry, name, value,
                                      SOURCE.OVERRIDE);

        if (!bound.isOk)
        {
            report(_run, cliSettings.why(_run.program.registry,
                                         resultStatus(bound), name,
                                         cutAt(value, ROOM - 1), ROOM));
            held = false;
        }
    }

    return held;
}

/*
setsAlone
  Whether a line of the settings file is one statement that sets a name
and nothing else: the line a new value for the name replaces.
*/
function setsAlone(
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

        if (!names.some((_name) => setsAlone(line, _name)))
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
                        cutAt(envInner.formatQuoted(setting.frame,
                                                    setting.scope,
                                                    setting.var),
                              ROOM - 1) + '\n';

        if (text.length >= capacity - out.length)
        {
            return null;
        }

        out += text;
    }

    return out;
}

function workSet(
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
        report(_run, 'cannot ' + _doing + ' \'' + file.name +
                     '\': ' + String(_error?.message ?? _error));
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
                         (typeof old === 'string') ? old : '',
                         _items);

    if (text === null)
    {
        return report(_run, 'out of memory');
    }

    try
    {
        file.write(text);
    }
    catch (error)
    {
        return said('write', error);
    }

    // what was set and kept, for whoever listens
    _run.set = _items.map((_item) => _item.slice(0, _item.indexOf('=')));

    return EXIT.OK;
}


//==============================================================================
// 2.  RUNNING
//==============================================================================

// the names the reference's parser knows in this program, as a person
// types them: every command's, the kit's two among them; the options the
// kit gives every command; and each command's own. They are here to be
// suggested, whether or not the port runs them.
const KNOWN_COMMANDS = ['list', 'describe', 'get', 'set', 'help',
                        'completion'];
const KNOWN_OPTIONS  = ['-q', '--quiet', '-v', '--verbose', '--color', '-h',
                        '--help', '--version'];
const OWN_OPTIONS    = { get: ['--show-origin'] };

// the reference's D_CFG_ARG_PARSER_SUGGESTION_DISTANCE, at its default
const SUGGESTION_DISTANCE = 2;

/*
dashesOf
  How the parser takes an argument: 2 for a long option's, `--` and a
name; 1 for a short one's, `-` and a name; 0 for any other, which is a
word. A name's first character is not '-' and is above '!'. reference:
d_arg_internal_parse_split_long, _split_short (arg_parse.c).
*/
function dashesOf(
    _argument
)
{
    const names = (_at) => ( (_argument.length > _at) &&
                             (_argument[_at] !== '-') &&
                             (_argument.charCodeAt(_at) > 33) );

    return ( _argument.startsWith('--') &&
             names(2) )                    ? 2
         : ( _argument.startsWith('-') &&
             names(1) )                    ? 1
                                           : 0;
}

/*
editDistance
  The optimal string alignment distance between two names: insertions,
deletions, substitutions and swaps of two neighbours; a distance past the
limit is the limit plus one. reference: d_arg_internal_edit_distance
(arg_suggest.c), which computes only the band that can hold an answer.
*/
function editDistance(
    _a,
    _b,
    _limit
)
{
    let earlier  = [];
    let previous = Array.from({ length: _b.length + 1 }, (_, _j) => _j);

    for (let i = 1; i <= _a.length; ++i)
    {
        const current = [i];

        for (let j = 1; j <= _b.length; ++j)
        {
            let best = Math.min(previous[j - 1] +
                                ((_a[i - 1] !== _b[j - 1]) ? 1 : 0),
                                previous[j] + 1,
                                current[j - 1] + 1);

            // two neighbours swapped
            if ( (i > 1)                    &&
                 (j > 1)                    &&
                 (_a[i - 1] === _b[j - 2])  &&
                 (_a[i - 2] === _b[j - 1]) )
            {
                best = Math.min(best, earlier[j - 2] + 1);
            }

            current.push(best);
        }

        earlier  = previous;
        previous = current;
    }

    return Math.min(previous[_b.length], _limit + 1);
}

/*
suggestion
  The name the parser suggests for an argument it did not expect, or null:
for `-x` or `--name`, an option's, compared without its dashes and without
a value after '='; for anything else that does not start with a dash, a
command's. The one nearest name, when it is within the distance and half
the longer name, no other is as near, and it is not the argument itself.
reference: d_arg_internal_suggest (arg_suggest.c).
*/
function suggestion(
    _given,
    _command
)
{
    const dashes = dashesOf(_given);
    const option = (dashes !== 0);
    const equals = _given.indexOf('=');
    const name   = option
                       ? _given.slice(dashes, (equals < dashes)
                                                  ? _given.length : equals)
                       : _given;
    let   nearest = SUGGESTION_DISTANCE + 1;
    let   tied    = false;
    let   best    = '';

    // an empty word, or one that starts with a dash, names nothing
    if ( !option &&
         ( (_given.length === 0) ||
           _given.startsWith('-') ) )
    {
        return null;
    }

    for (const written of (option ? KNOWN_OPTIONS.concat(
                                        OWN_OPTIONS[_command] ?? [])
                                  : KNOWN_COMMANDS))
    {
        const candidate = written.replace(/^-+/, '');
        const distance  = editDistance(name, candidate,
                                       SUGGESTION_DISTANCE);

        // the argument itself, too far to resemble it, or no nearer
        if ( (written === _given)                                     ||
             ((2 * distance) > Math.max(name.length, candidate.length)) ||
             (distance > nearest) )
        {
            continue;
        }

        if (distance === nearest)
        {
            tied = ( tied ||
                     (written !== best) );
        }
        else
        {
            nearest = distance;
            tied    = false;
            best    = written;
        }
    }

    return ( (best.length !== 0) &&
             !tied ) ? best : null;
}

/*
suggestions
  The parser's notes for arguments it did not expect, a line for each that
has a suggestion; among several, each says which argument it is for.
`_words` holds the places of those that were taken as words after a `--`.
*/
function suggestions(
    _command,
    _extras,
    _words = new Set()
)
{
    const notes = [];

    for (const [index, extra] of _extras.entries())
    {
        // an argument taken after `--` is a word, whatever it starts with,
        // and a word that starts with a dash names nothing
        const name = ( _words.has(index) &&
                       extra.startsWith('-') )
                         ? null
                         : suggestion(extra, _command);

        if (name !== null)
        {
            notes.push('did you mean \'' + name + '\'' +
                       ((_extras.length > 1) ? (' for \'' + extra + '\'')
                                             : '') + '?');
        }
    }

    return notes;
}

/*
joinedExtras
  Unexpected arguments as the parser's message lists them: a space between
each, and a space that ends them all dropped, as the reference's join
drops it (d_arg_internal_parse_extras_join).
*/
function joinedExtras(
    _extras
)
{
    const joined = _extras.join(' ');

    return joined.endsWith(' ') ? joined.slice(0, -1) : joined;
}

/*
unexpected
  The usage error for the arguments a command does not expect, or the
program with no command: every one of them, in the order they were given.
*/
function unexpected(
    _run,
    _command,
    _extras,
    _words = new Set()
)
{
    return usageError(_run, _command,
                      ((_extras.length === 1)
                           ? 'the following argument was not expected: '
                           : 'the following arguments were not expected: ') +
                      joinedExtras(_extras),
                      suggestions(_command, _extras, _words));
}

/*
strayWord
  The word the kit says is no command, where the program was given
arguments and no command: the one argument whole, or, of several, what
they join to as far as its first space; null where that starts with a
dash or there is nothing, when the parser's own message stands.
reference: d_cli_internal_stray_word (cli_program.c).
*/
function strayWord(
    _extras
)
{
    const joined = joinedExtras(_extras);
    const space  = joined.indexOf(' ');
    const word   = ( (_extras.length > 1) &&
                     (space >= 0) ) ? joined.slice(0, space) : joined;

    return ( (joined.length === 0) ||
             word.startsWith('-') ) ? null : word;
}

// the shells the reference writes a completion script for, as it lists them
const SHELLS = Object.keys(kit.completion);

// the long options that are the program's own, which no setting's option
// is taken for: the kit's, `--colour` among them, and each command's
const OWN_LONG = ['--help', '--version', '--quiet', '--verbose', '--color',
                  '--colour', '--show-origin'];

/*
read
  A command line's arguments, read as the reference's parser and kit read
them for this program (arg_parse.c, cli_program.c):
  - the first word that is a command's name is the command; a word before
    it, and what the command does not take, is unexpected;
  - `-h`, `-q` and `-v`, alone or run together, and `--help`, `--version`,
    `--quiet`, `--verbose` and `--color[=WHEN]` are taken wherever they
    stand; a flag given a value with '=' keeps the flag;
  - `--` ends the options of a command that still needs an operand, and
    everything after it is that command's; a command that needs none ends
    at it, and what follows is the program's again, where a word is no
    longer a command; a `--` of the program's own makes all that follows
    it unexpected, and a command's name there, where there has been no
    command, is a command misplaced.
*/
function read(
    _arguments
)
{
    const line  = { command: null, operands: [], extras: [], counted: 0,
                    origin: false, help: false, version: false, quiet: 0,
                    verbose: 0, colours: [], colourName: null,
                    misplaced: null, helped: false, words: new Set() };
    const queue = [..._arguments];
    let   mode  = 'program';
    let   only  = false;

    // an argument nothing takes; a `--` is listed and not counted, and
    // one taken as a word after a `--` is remembered as one
    const extra = (_argument, _counts = true, _word = false) =>
    {
        if (_word)
        {
            line.words.add(line.extras.length);
        }

        line.extras.push(_argument);
        line.counted += _counts ? 1 : 0;
    };

    // whether the command still needs an operand
    const needs = () => ( ['describe', 'set', 'completion']
                              .includes(line.command) &&
                          (line.operands.length === 0) );

    // a command's name taken where a command cannot stand
    const misplace = (_argument) =>
    {
        line.helped    = (line.misplaced === null) ? line.help : line.helped;
        line.misplaced = ( (line.misplaced === null) ||
                           (KNOWN_COMMANDS.indexOf(_argument) <
                            KNOWN_COMMANDS.indexOf(line.misplaced)) )
                             ? _argument : line.misplaced;
        line.command   = _argument;
        line.operands  = [];
        mode           = 'command';
    };

    // a word given to the command
    const operand = (_argument) =>
    {
        // `help` takes two words, though it has help for one
        if ( (line.command === 'list') ||
             ( ['describe', 'completion'].includes(line.command) &&
               (line.operands.length === 1) )           ||
             ( (line.command === 'help') &&
               (line.operands.length === 2) ) )
        {
            // a word a misplaced command cannot take is the program's
            // again, where a command's name is another one misplaced
            if ( (line.misplaced !== null) &&
                 (mode === 'command')      &&
                 KNOWN_COMMANDS.includes(_argument) )
            {
                misplace(_argument);
            }
            else
            {
                extra(_argument, true, mode === 'operands');
            }
        }
        else
        {
            line.operands.push(_argument);
        }
    };

    while (queue.length !== 0)
    {
        const argument = queue.shift();
        const dashes   = dashesOf(argument);
        const equals   = argument.indexOf('=');
        const name     = (equals < 0) ? argument : argument.slice(0, equals);

        if (mode === 'operands')
        {
            operand(argument);
        }
        else if ( only &&
                  (mode !== 'command') )
        {
            // after the program's own `--`: a command's name, where no
            // command has been in its place, is a command misplaced. It
            // is read on as a command is, though help asked of it is not
            // help asked for; and when it ends, the next may be another.
            // The one named is the first of them as the program lists
            // its commands
            if ( ( (mode === 'program') ||
                   (line.misplaced !== null) ) &&
                 KNOWN_COMMANDS.includes(argument) )
            {
                misplace(argument);
            }
            else
            {
                extra(argument, true, true);
            }
        }
        else if (argument === '--')
        {
            if ( (mode === 'command') &&
                 needs() )
            {
                mode = 'operands';
            }
            else if (mode === 'command')
            {
                mode = 'ended';
            }
            else
            {
                only = true;
                extra(argument, false);
            }
        }
        else if (dashes === 2)
        {
            if (name === '--help')
            {
                line.help = true;
            }
            else if (name === '--version')
            {
                line.version = true;
            }
            else if (name === '--quiet')
            {
                ++line.quiet;
            }
            else if (name === '--verbose')
            {
                ++line.verbose;
            }
            else if ( (name === '--color') ||
                      (name === '--colour') )
            {
                // with no word, or an empty one, the flag's own: always
                line.colours.push( ( (equals < 0) ||
                                     (equals === argument.length - 1) )
                                       ? 'always'
                                       : argument.slice(equals + 1) );
                line.colourName = name;
            }
            else if ( (mode === 'command')     &&
                      (line.command === 'get') &&
                      (name === '--show-origin') )
            {
                line.origin = true;
            }
            else
            {
                extra(argument);
            }
        }
        else if (dashes === 1)
        {
            // short flags run together are taken one at a time, and what
            // is left after one goes back to be read as `-REST`
            if (!'hqv'.includes(argument[1]))
            {
                extra(argument);
            }
            else
            {
                line.help     = ( line.help ||
                                  (argument[1] === 'h') );
                line.quiet   += (argument[1] === 'q') ? 1 : 0;
                line.verbose += (argument[1] === 'v') ? 1 : 0;

                if (argument.length > 2)
                {
                    queue.unshift('-' + argument.slice(2));
                }
            }
        }
        else if (mode === 'program')
        {
            if (KNOWN_COMMANDS.includes(argument))
            {
                line.command = argument;
                mode         = 'command';
            }
            else
            {
                extra(argument);
            }
        }
        else if (mode === 'ended')
        {
            extra(argument);
        }
        else
        {
            operand(argument);
        }
    }

    if (line.misplaced !== null)
    {
        line.help = line.helped;
    }

    return line;
}

/*
coloured
  What a run said, with each diagnostic's start coloured as the kit colours
one: the program's name bold, and `error:`, `warning:` or `note:` in its
own colour. reference: d_cli_vreport (cli_program.c).
*/
function coloured(
    _name,
    _said
)
{
    const KINDS = [['error', '1;31'], ['warning', '1;35'], ['note', '1;36']];

    return _said.split('\n').map((_line) =>
    {
        for (const [kind, colour] of KINDS)
        {
            const plain = _name + ': ' + kind + ': ';

            if (_line.startsWith(plain))
            {
                return '\x1B[1m' + _name + ':\x1B[0m \x1B[' + colour + 'm' +
                       kind + ':\x1B[0m ' + _line.slice(plain.length);
            }
        }

        return _line;
    }).join('\n');
}

/*
colourAsked
  Whether `--color`'s words ask for colour: the last decides, and only as
"always". "auto" is no colour where nothing is a terminal, and a word that
is none of the three is refused before any work, or changes nothing where
the line was wrong some other way. reference:
d_cli_internal_read_standard (cli_program.c).
*/
function colourAsked(
    _words
)
{
    return ( (_words.length !== 0) &&
             (_words[_words.length - 1] === 'always') );
}

/*
workHelp
  `help`: the program's help, or the help of the one command named.
*/
function workHelp(
    _run,
    _operands
)
{
    const wrong = !KNOWN_COMMANDS.includes(_operands[0] ?? 'help')
                      ? _operands[0]
                      : (_operands.length > 1) ? _operands[1] : null;

    if (wrong !== null)
    {
        return usageError(_run, 'help', '\'' + wrong + '\' is not a command');
    }

    _run.out += kit.help[_operands[0] ?? ''];

    return EXIT.OK;
}

/*
workCompletion
  `completion`: the shell's script, as the reference writes it.
*/
function workCompletion(
    _run,
    _operands
)
{
    if (!SHELLS.includes(_operands[0]))
    {
        return usageError(_run, 'completion',
                          '\'' + _operands[0] + '\' is not a shell: ' +
                          SHELLS.slice(0, -1).join(', ') + ' or ' +
                          SHELLS[SHELLS.length - 1]);
    }

    _run.out += kit.completion[_operands[0]];

    return EXIT.OK;
}

function runInner(
    _program,
    _argv
)
{
    const run   = { program: _program, out: '', err: '', set: [] };
    const taken = cliSettings.take(_program.registry, _argv, KNOWN_COMMANDS,
                                   OWN_LONG);
    const done  = (_status, _colour) =>
        ({ status: _status, out: run.out,
           err: _colour ? coloured(_program.name, run.err) : run.err,
           set: run.set });

    if (taken.refused !== null)
    {
        // said before the program's own options are read: never coloured
        usageError(run, taken.refused.command, taken.refused.message);

        return done(EXIT.TROUBLE, false);
    }

    const line   = read(taken.kept.slice(1));
    const colour = colourAsked(line.colours);
    const work   = { list:       () => workList(run),
                     describe:   () => workDescribe(run, line.operands),
                     get:        () => workGet(run, line.operands,
                                               line.origin),
                     set:        () => workSet(run, line.operands),
                     help:       () => workHelp(run, line.operands),
                     completion: () => workCompletion(run, line.operands) };
    const needed = { describe: 'DJIN', set: 'SETTING', completion: 'SHELL' };
    let   status;

    if (line.help)
    {
        // help asked for is given, whatever else the line holds: the
        // help of the command reached, which a misplaced one is not
        run.out += kit.help[(line.misplaced === null)
                                ? (line.command ?? '') : ''];
        status   = EXIT.OK;
    }
    else if (line.version)
    {
        run.out += kit.version;
        status   = EXIT.OK;
    }
    else if (line.misplaced !== null)
    {
        status = usageError(run, null,
                            '\'' + line.misplaced + '\' follows \'--\': a ' +
                            'command comes before it');
    }
    else if (line.command === null)
    {
        if (line.counted === 0)
        {
            run.err += _program.name + ': error: a command is required\n' +
                       'Usage: ' + _program.name +
                       ' [OPTION]... COMMAND [ARGUMENT]...\n' +
                       'Commands: ' +
                       ((_argv.length > 1) ? KNOWN_COMMANDS
                                           : COMMANDS).join(', ') + '\n' +
                       'Try \'' + _program.name +
                       ' --help\' for more information.\n';
            status   = EXIT.TROUBLE;
        }
        else if (strayWord(line.extras) === null)
        {
            status = unexpected(run, null, line.extras, line.words);
        }
        else
        {
            status = usageError(run, null, '\'' + strayWord(line.extras) +
                                           '\' is not a command',
                                suggestions(null, line.extras, line.words));
        }
    }
    else if ( (needed[line.command] !== undefined) &&
              (line.operands.length === 0) )
    {
        // what a command requires is missed before what it does not expect
        status = usageError(run, line.command,
                            needed[line.command] + ' is required');
    }
    else if (line.counted !== 0)
    {
        status = unexpected(run, line.command, line.extras, line.words);
    }
    else if ( (line.colours.length !== 0) &&
              !['auto', 'always', 'never']
                   .includes(line.colours[line.colours.length - 1]) )
    {
        // the last word of `--color`, where the line is otherwise right
        status = usageError(run, null,
                            line.colourName + ': \'' +
                            line.colours[line.colours.length - 1] +
                            '\' is not auto, always or never');
    }
    else
    {
        // at -v, an option that keeps one word and was given differing
        // ones is said before the work (d_cli_internal_say_repeat)
        if ( (line.quiet === 0)         &&
             (line.verbose > 0)         &&
             (line.colours.length > 1)  &&
             line.colours.some((_word) => (_word !== line.colours[0])) )
        {
            run.err += _program.name + ': warning: --color was given ' +
                       ((line.colours.length === 2)
                            ? 'twice'
                            : (line.colours.length + ' times')) +
                       '; the last, \'' +
                       line.colours[line.colours.length - 1] +
                       '\', is taken\n';
        }

        status = work[line.command]();
    }

    return done(status, colour);
}

// 2.1
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
export function programRun(
    _program,
    _argv
)
{
    const ran = runInner(_program,
                         _argv.map((_word) => envInner.cstr(_word)));

    return { status: ran.status, out: ran.out, err: ran.err,
             set: ran.set };
}
