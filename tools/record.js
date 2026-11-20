/*******************************************************************************
* djinterp.js [tools]                                                  record.js
*
*   Records transcripts from the reference (docs/JS_STYLE.md, section 6):
*     node tools/record.js BUILD COMMIT [NAME ...]
*   BUILD is where tools/build.sh built the tools; COMMIT is the
* reference's commit, written into each `.meta`. With no NAME, every
* `tests/transcripts/*.in` is recorded.
*   A transcript's name says which program it is given to:
*     session_NAME   BUILD/session, the whole `.in` as its input
*     program_NAME   BUILD/djinterp_fixture, once a line, as a new process
*                    each, as a shell would run the reference's program
*   For each it writes NAME.out, the program's bytes, and NAME.meta.
*   A `.meta` is written so that recording again what has not changed
* changes nothing: where the program's bytes and the commit are those of
* the recording already there, its date is kept. Lines of a `.meta` that
* the recorder does not write itself (a fuzzed input's seed, count and
* the command that made it) are a person's, and are kept after its own.
*
*   A PROGRAM TRANSCRIPT's `.in` holds command lines, and lines that set
* the scene for those after them:
*     env NAME=VALUE    a variable of the environment, for every later line
*     unenv NAME        takes one away
*     file TEXT         the user's settings file's text; \n \t \\ escape
*     nofile            no settings file
*     # ...             a comment
*   Each command line is given to the program as `--line LINE`, in a home
* of the transcript's own, named in its `.meta`, so that the file's path
* in what the program writes is the same on every recording. Its `.out`
* has, for each line: the line after "> "; for a command line, "exit N",
* then the program's output a line each after "out: ", then its errors
* after "err: ". A last line with no line break is written after "out\ "
* or "err\ ".
*
*
* path:      /tools/record.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
         writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE        = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS = join(HERE, '..', 'tests', 'transcripts');
const HOME_ROOT   = '/tmp/djinterp.js/home';
const REPOSITORY  = 'djinterp';

// the keys of the lines the recorder writes; any other line is a person's
const WRITTEN = new Set(['program', 'arguments', 'reference', 'commit',
                         'recorded', 'home', 'settings', 'environment']);

/*
write_transcript
  A transcript's `.out` and its `.meta`: what was run, on what, and when.
The date is the one already there where nothing it dates has changed.
*/
function write_transcript(
    _name,
    _bytes,
    _program,
    _arguments,
    _commit,
    _more
)
{
    const out_path  = join(TRANSCRIPTS, _name + '.out');
    const meta_path = join(TRANSCRIPTS, _name + '.meta');
    const before    = existsSync(meta_path)
                          ? readFileSync(meta_path, 'utf8').split('\n')
                                .filter((_line) => (_line.length !== 0))
                          : [];
    const key_of    = (_line) => _line.slice(0, _line.indexOf(':'));
    const had       = (_key) => before.find((_line) =>
                                                (key_of(_line) === _key));
    const same      = existsSync(out_path) &&
                      readFileSync(out_path).equals(_bytes) &&
                      (had('commit') === ('commit: ' + _commit)) &&
                      (had('recorded') !== undefined);
    const lines     = [
        'program: ' + _program,
        'arguments: ' + _arguments,
        'reference: ' + REPOSITORY,
        'commit: ' + _commit,
        same ? had('recorded')
             : ('recorded: ' + new Date().toISOString().slice(0, 10)),
        ..._more,
        ...before.filter((_line) => !WRITTEN.has(key_of(_line)))
    ];

    writeFileSync(out_path, _bytes);
    writeFileSync(meta_path, lines.join('\n') + '\n');

    return;
}

/**
 * What BUILD/session answers a whole input with, in an empty environment.
 *
 * @param {string} _build  where the tools were built.
 * @param {Buffer} _input  the session's lines.
 * @returns {Buffer} its output.
 * @throws {Error} where the program did not exit with 0.
 */
export function session_bytes(
    _build,
    _input
)
{
    const run = spawnSync(join(_build, 'session'), [], {
        input:     _input,
        env:       {},
        maxBuffer: 1 << 28
    });

    if (run.status !== 0)
    {
        throw new Error('tools/session exited ' + run.status);
    }

    return run.stdout;
}

/*
record_session
  A session transcript: the whole input to BUILD/session.
*/
function record_session(
    _build,
    _commit,
    _name
)
{
    const bytes = session_bytes(_build, readFileSync(join(TRANSCRIPTS,
                                                          _name + '.in')));

    write_transcript(_name, bytes, 'tools/session.c',
                     '(none; the input is its standard input)', _commit,
                     ['environment: empty']);

    return;
}

/*
stream_lines
  A stream's bytes as lines after a prefix; a last line with no line break
after the prefix with a backslash.
*/
function stream_lines(
    _prefix,
    _bytes
)
{
    const out   = [];
    let   start = 0;

    while (start < _bytes.length)
    {
        const end  = _bytes.indexOf(0x0A, start);
        const last = (end < 0);

        out.push(Buffer.from(_prefix + (last ? '\\ ' : ': ')),
                 _bytes.subarray(start, last ? _bytes.length : end),
                 Buffer.from('\n'));
        start = last ? _bytes.length : (end + 1);
    }

    return out;
}

/**
 * Where a program transcript's home is, and its settings file in it.
 *
 * @param {string} _name  the transcript's name.
 * @returns {{home: string, settings: string}}
 */
export function program_home(
    _name
)
{
    const home = join(HOME_ROOT, _name);

    return { home: home, settings: join(home, 'djinterp', 'settings') };
}

/**
 * What BUILD/djinterp_fixture answers a program transcript's input with:
 * a process a command line, in a home of the transcript's own, made anew.
 *
 * @param {string} _build  where the tools were built.
 * @param {string} _name   the transcript's name: its home's.
 * @param {string} _input  the input, a byte a code unit.
 * @returns {Buffer} the transcript's `.out`.
 */
export function program_bytes(
    _build,
    _name,
    _input
)
{
    const { home, settings } = program_home(_name);
    const env      = { HOME: home, XDG_CONFIG_HOME: home };
    const out      = [];
    const unescape = (_text) => _text.replace(/\\([nt\\])/g, (_m, _c) =>
                         ((_c === 'n') ? '\n' : (_c === 't') ? '\t' : '\\'));

    rmSync(home, { recursive: true, force: true });
    mkdirSync(home, { recursive: true });

    const lines = _input.split('\n');

    if (lines[lines.length - 1] === '')
    {
        lines.pop();
    }

    for (const line of lines)
    {
        out.push(Buffer.from('> ' + line + '\n', 'latin1'));

        if ( (line.length === 0) ||
             line.startsWith('#') )
        {
            continue;
        }

        if (line.startsWith('env '))
        {
            const equals = line.indexOf('=');

            env[line.slice(4, equals)] = line.slice(equals + 1);
        }
        else if (line.startsWith('unenv '))
        {
            delete env[line.slice(6)];
        }
        else if (line.startsWith('file '))
        {
            mkdirSync(dirname(settings), { recursive: true });
            writeFileSync(settings, unescape(line.slice(5)), 'latin1');
        }
        else if (line === 'nofile')
        {
            rmSync(settings, { force: true });
        }
        else
        {
            const run = spawnSync(join(_build, 'djinterp_fixture'),
                                  ['--line', Buffer.from(line, 'latin1')],
                                  { env: env });

            out.push(Buffer.from('exit ' + run.status + '\n'),
                     ...stream_lines('out', run.stdout),
                     ...stream_lines('err', run.stderr));
        }
    }

    return Buffer.concat(out);
}

/*
record_program
  A program transcript: BUILD/djinterp_fixture, a process a command line.
*/
function record_program(
    _build,
    _commit,
    _name
)
{
    const { home, settings } = program_home(_name);
    const bytes = program_bytes(_build, _name,
                                readFileSync(join(TRANSCRIPTS, _name + '.in'),
                                             'latin1'));

    write_transcript(_name, bytes, 'tools/djinterp_fixture_main.c',
                     '--line LINE, a process a command line', _commit,
                     ['home: ' + home, 'settings: ' + settings,
                      'environment: HOME and XDG_CONFIG_HOME are the home; ' +
                      'then as the input\'s env lines set it']);

    return;
}

/*
main
  Records the transcripts named, or every one.
*/
function main(
    _arguments
)
{
    const [build, commit, ...names] = _arguments;

    if ( (build === undefined) ||
         (commit === undefined) )
    {
        console.error('usage: node tools/record.js BUILD COMMIT [NAME ...]');
        process.exit(2);
    }

    const all = (names.length !== 0)
                    ? names
                    : readdirSync(TRANSCRIPTS)
                          .filter((_file) => _file.endsWith('.in'))
                          .map((_file) => _file.slice(0, -3))
                          .sort();

    for (const name of all)
    {
        if (name.startsWith('session_'))
        {
            record_session(build, commit, name);
        }
        else if (name.startsWith('program_'))
        {
            record_program(build, commit, name);
        }
        else
        {
            throw new Error(name + ': neither session_ nor program_');
        }

        console.log('recorded ' + name);
    }

    return;
}

// run as a program, and not when imported (tools/fuzz_check.js)
if ( (process.argv[1] !== undefined) &&
     (import.meta.url === pathToFileURL(process.argv[1]).href) )
{
    main(process.argv.slice(2));
}
