/*******************************************************************************
* djinterp.js [tests]                                                 program.js
*
*   The reference's djinterp program over the fixture, replayed through the
* port: what tools/record.js records of tools/djinterp_fixture_main.c, a
* line at a time. Each command line is a new program -- a registry made
* from generated/program.json, which is the reference's own registry
* written out, the kit's rows among them -- started over the settings file
* and the environment the lines before it left, as each of the reference's
* runs is a new process.
*   The lines and what is written for each are set out in tools/record.js.
*
*
* path:      /tests/support/program.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import * as option_env from '../../src/option/option_env.js';
import * as option_env_registry from '../../src/option/option_env_registry.js';
import { decode, encode } from '../../src/text/utf8.js';
import * as djinterp_commands
    from '../../src/tools/djinterp/djinterp_commands.js';
import { split } from '../../src/djinterp.js';
import { generated } from './fixture.js';

/*
must
  A step of making the fixture that the reference's own making passed.
*/
function must(
    _result
)
{
    if (!_result.is_ok)
    {
        throw new Error('the program\'s registry could not be made');
    }

    return _result;
}

/**
 * The reference's program, made over the port: its registry from
 * generated/program.json, and its settings started.
 *
 * @param {object} _file         the settings file.
 * @param {Map<string, string>} _environment  the environment.
 * @returns {{program: object, warnings: string}}
 */
export function make_program(
    _file,
    _environment
)
{
    const data     = generated('program.json');
    const first    = data.frames[0];
    const registry = must(option_env_registry.init(first.name, {
        bindings: first.bindings, vars: first.vars, text: first.text
    })).registry;

    for (const fx of data.frames)
    {
        const frame = fx.is_root
            ? option_env_registry.frame(registry)
            : option_env.init({ bindings: fx.bindings, vars: fx.vars,
                                text: fx.text });

        if (!fx.is_root)
        {
            must(option_env.set_name(frame, fx.name));
        }

        must(option_env.declare_all(frame, fx.rows));

        if (fx.scopes.length !== 0)
        {
            must(option_env.set_scopes(frame, fx.scopes));
        }

        if (!fx.is_root)
        {
            must(option_env_registry.add(registry, frame));
        }
    }

    const program = djinterp_commands.program_make({
        registry: registry, file: _file, environment: _environment
    });

    return { program:  program,
             warnings: djinterp_commands.program_start(program) };
}

/*
stream_lines
  A stream's text as lines after a prefix; a last line with no line break
after the prefix with a backslash.
*/
function stream_lines(
    _prefix,
    _text
)
{
    let out   = '';
    let start = 0;

    while (start < _text.length)
    {
        const end  = _text.indexOf('\n', start);
        const last = (end < 0);

        out  += _prefix + (last ? '\\ ' : ': ') +
                _text.slice(start, last ? _text.length : end) + '\n';
        start = last ? _text.length : (end + 1);
    }

    return out;
}

/**
 * A whole program transcript's input, replayed.
 *
 * @param {string} _input     the `.in` file's bytes, as a byte string.
 * @param {string} _settings  what the settings file is called: the path
 *        the transcript's `.meta` names.
 * @returns {string} the `.out` file's bytes, as a byte string.
 */
export function run_program(
    _input,
    _settings
)
{
    const environment = new Map();
    const unescape    = (_text) => _text.replace(/\\([nt\\])/g, (_m, _c) =>
                            ((_c === 'n') ? '\n' : (_c === 't') ? '\t'
                                                                : '\\'));
    let   text        = null;
    let   out         = '';
    const file        = {
        name:  _settings,
        read:  () => text,
        write: (_new) =>
        {
            text = _new;
        }
    };
    const lines       = _input.split('\n');

    if (lines[lines.length - 1] === '')
    {
        lines.pop();
    }

    for (const line of lines)
    {
        out += '> ' + line + '\n';

        if ( (line.length === 0) ||
             line.startsWith('#') )
        {
            continue;
        }

        if (line.startsWith('env '))
        {
            const equals = line.indexOf('=');

            environment.set(decode(line.slice(4, equals)),
                            decode(line.slice(equals + 1)));
        }
        else if (line.startsWith('unenv '))
        {
            environment.delete(decode(line.slice(6)));
        }
        else if (line.startsWith('file '))
        {
            text = decode(unescape(line.slice(5)));
        }
        else if (line === 'nofile')
        {
            text = null;
        }
        else
        {
            // a new process: the registry made again, its settings started
            const { program, warnings } = make_program(file, environment);
            const words = split(decode(line));
            const ran   = (words === null)
                ? { status: 2, out: '',
                    err: 'djinterp: error: a quote is not closed\n' }
                : djinterp_commands.program_run(program,
                                                ['djinterp', ...words]);

            // an unclosed quote is found before the program starts
            out += 'exit ' + ran.status + '\n' +
                   stream_lines('out', encode(ran.out)) +
                   stream_lines('err', encode(((words === null) ? ''
                                                               : warnings) +
                                              ran.err));
        }
    }

    return out;
}
