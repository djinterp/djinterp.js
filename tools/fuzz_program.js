/*******************************************************************************
* djinterp.js [tools]                                            fuzz_program.js
*
*   Writes the input of a program transcript that nobody typed:
*     node tools/fuzz_program.js SEED COUNT > tests/transcripts/program_X.in
*   COUNT lines for tools/record.js to give the reference's program over
* the fixture: its commands with the fixture's names and near misses of
* them, values of every kind in and out of range, settings given on the
* command line, and lines that set the environment and the settings file
* for the lines after. Every choice follows from SEED, so the same SEED and
* COUNT give the same file.
*   It gives every word the program takes: the four commands, `help` and
* `completion`, the kit's options (`-h`, `-q`, `-v`, run together or
* apart, and their long forms, `--color` with and without a word,
* `--version`), `--` wherever it may stand, and words that are nearly
* any of these, which the reference's parser answers with "did you mean".
*   One thing it keeps from: `--version` with `-v`, which names the file
* and the compiler of the reference's own build (HANDOFF.md, "what is not
* ported").
*
*
* path:      /tools/fuzz_program.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

let state = (Number(process.argv[2]) >>> 0) || 1;
const count = Number(process.argv[3]) || 100;

/*
next
  The generator: xorshift32. A whole number under _bound.
*/
function next(
    _bound
)
{
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state % _bound;
}

const pick = (_list) => _list[next(_list.length)];

const ROOT    = ['color', 'width', 'ratio', 'title', 'depth', 'max_depth',
                 'plugin_path'];
const PRINTER = ['key_width', 'style', 'format', 'select', 'prefix',
                 'banner', 'seed', 'scale', 'module', 'width'];
const NET     = ['host', 'port', 'p', 'mode', 'bits', 'big'];
const CACHE   = ['size', 'path'];
const VALUES  = ['0', '1', '-1', '8', '30', '99', '100', '121', '240',
                 '600', '601', '4096', '65535', '65536', '0x10', '0b101',
                 '9007199254740993', '9223372036854775807',
                 '9223372036854775808', 'true', 'false', 'yes', 'no', 'on',
                 'off', 'plain', 'json', 'table', 'grid', 'xml', 'yaml',
                 'none', 'c', 'c,cpp', 'c|posix', '+wide', '-cpp', 'all',
                 'legacy', 'a|b', 'sign', 'huge', 'low', 'unbounded',
                 'shallow', 'auto', '0.5', '-2.75', '1e21', '1e-7', 'inf',
                 'nan', '1e309', '0.1', 'hello', '', 'a;b', 'a#b', 'x=y',
                 '/var/cache', 'example.org'];
const QUOTED  = ['"two words"', '\'  padded  \'', '"a \\"b\\" c"',
                 '\'back\\slash\'', '"semi;colon"', '\'hash # tag\''];

/*
mangle
  A name, as it is most of the time, or a near miss of it.
*/
function mangle(
    _name
)
{
    const at = next(_name.length + 1);

    switch (next(10))
    {
        case 0:  return _name.slice(0, at) + _name.slice(at + 1);
        case 1:  return _name.slice(0, at) + pick(['x', '_', 'e']) +
                        _name.slice(at);
        case 2:  return (at + 1 < _name.length)
                     ? (_name.slice(0, at) + _name[at + 1] + _name[at] +
                        _name.slice(at + 2))
                     : _name;
        default: return _name;
    }
}

// what the reference's parser knows by name
const KNOWN = ['list', 'describe', 'get', 'set', 'help', 'completion',
               '--show-origin', '--quiet', '--verbose', '--color', '--help',
               '--version'];

// the kit's options, as a person gives them
const FLAGS = ['-q', '-v', '-qv', '-vv', '-vq', '--quiet', '--verbose',
               '--color', '--color=always', '--color=never', '--color=auto',
               '--color=bad', '--color=', '-qx', '-x', '--quiet=1'];

/*
stray
  A word that is nearly a name the parser knows, for its "did you mean":
a name with a character dropped, added, doubled or swapped with its
neighbour, once or twice. Never empty.
*/
function stray()
{
    for (;;)
    {
        let word = pick(KNOWN);

        for (let i = next(2) + 1; i > 0; --i)
        {
            const at = next(word.length);

            switch (next(4))
            {
                case 0:  word = word.slice(0, at) + word.slice(at + 1);
                         break;
                case 1:  word = word.slice(0, at) +
                                pick(['x', '_', 'e', 't', 'S']) +
                                word.slice(at);
                         break;
                case 2:  word = word.slice(0, at) + word[at] +
                                word.slice(at);
                         break;
                default: word = (at + 1 < word.length)
                                    ? (word.slice(0, at) + word[at + 1] +
                                       word[at] + word.slice(at + 2))
                                    : word;
                         break;
            }
        }

        if (word.length !== 0)
        {
            return word;
        }
    }
}

/*
full
  A setting's full name, or something near one.
*/
function full()
{
    switch (next(12))
    {
        case 0: case 1: case 2:
            return mangle(pick(ROOT));
        case 3: case 4: case 5: case 6:
            return mangle('printer') + '.' + mangle(pick(PRINTER));
        case 7:
            return 'net.' + mangle(pick(NET));
        case 8:
            return mangle('cache') + '.' + mangle(pick(CACHE));
        case 9:
            return pick(['debug.', 'printer.summary.',
                         'printer.cpp_features.', 'printer.debug.',
                         'nothing.']) +
                   mangle(pick([...ROOT, ...PRINTER]));
        case 10:
            return 'cli.' + pick(['plugin_search', 'plugin_strict_version']);
        default:
            return pick(['printer', 'printer.', '.style', 'nothing']);
    }
}

const value   = () => ((next(8) === 0) ? pick(QUOTED) : pick(VALUES));
const setting = () => full() + '=' + value();

/*
option
  A setting given on the command line, in one of its forms; names with a
point only, as the kit takes them, but for --set.
*/
function option()
{
    const dotted = () => mangle('printer') + '.' + mangle(pick(PRINTER));

    switch (next(5))
    {
        case 0:  return '--set ' + setting();
        case 1:  return '--' + dotted() + '=' + pick(VALUES);
        case 2:  return '--' + dotted();
        case 3:  return '--no-' + dotted();
        default: return '--set ' + full();
    }
}

/*
command
  A command line.
*/
function command()
{
    const words = [];
    const many  = (_make) =>
    {
        for (let i = next(4); i > 0; --i)
        {
            words.push(_make());
        }
    };

    switch (next(12))
    {
        case 0:
            words.push('list');
            break;
        case 1:
            words.push('describe',
                       pick(['printer', 'net', 'cache', 'cli', 'nothing',
                             'djinterp', 'printer_two']));
            break;
        case 2: case 3: case 4: case 5:
            words.push('get');
            words.push(...((next(2) === 0) ? ['--show-origin'] : []));
            many(full);
            break;
        case 6: case 7: case 8: case 9:
            words.push('set', setting());
            many(setting);
            break;
        case 10:
            words.push('get', '--show-origin');
            break;
        default:
            words.push(pick(['get', 'set', 'describe', 'list']));
            many(() => pick([full(), setting(), 'printer']));
            break;
    }

    // the kit's two commands, in the others' place now and then
    if (next(8) === 0)
    {
        words.length = 0;

        if (next(2) === 0)
        {
            words.push('help');
            many(() => pick([...KNOWN.slice(0, 6), 'nothing', stray()]));
        }
        else
        {
            words.push('completion');
            many(() => pick(['bash', 'zsh', 'fish', 'powershell', 'csh',
                             stray()]));
        }
    }

    // settings on the command line, wherever they stand
    for (let i = (next(3) === 0) ? (next(2) + 1) : 0; i > 0; --i)
    {
        words.splice(next(words.length + 1), 0, option());
    }

    // words that are nearly names the parser knows, wherever they stand;
    // now and then one in the command's own place
    if (next(6) === 0)
    {
        if (next(4) === 0)
        {
            words[0] = stray();
        }

        for (let i = next(3); i > 0; --i)
        {
            words.splice(next(words.length + 1), 0, stray());
        }
    }

    // the kit's options, wherever they stand
    for (let i = (next(3) === 0) ? (next(3) + 1) : 0; i > 0; --i)
    {
        words.splice(next(words.length + 1), 0, pick(FLAGS));
    }

    // a `--`, or two, wherever they stand
    for (let i = (next(5) === 0) ? (next(2) + 1) : 0; i > 0; --i)
    {
        words.splice(next(words.length + 1), 0, '--');
    }

    // help or a version asked for, which the rest of a line gives way to
    if (next(14) === 0)
    {
        words.splice(next(words.length + 1), 0,
                     pick(['--help', '-h', '--version', '-hq', '-qh']));
    }

    // `--version` at -v names the reference's own build: kept from, by
    // leaving out every short option and every `--verbose` of such a line
    if (words.some((_word) => /^--version(=|$)/.test(_word)))
    {
        return words.filter((_word) => !( /^-[^-]/.test(_word) ||
                                          _word.startsWith('--verbose') ))
                    .join(' ');
    }

    return words.join(' ');
}

/*
file
  A line that gives the settings file its text.
*/
function file()
{
    let text = '';

    for (let i = next(6); i > 0; --i)
    {
        text += pick(['', '  ', '# ']) +
                pick([full() + ' = ' + pick(VALUES), full(),
                      '-' + full(), full() + '=' + pick(VALUES) + ' ; ' +
                      full() + ' = ' + pick(VALUES)]) +
                pick(['', ' # c', ' ']) + '\\n';
    }

    return 'file ' + text;
}

const lines = [];

for (let i = 0; i < count; ++i)
{
    switch (next(14))
    {
        case 0:
            lines.push('env DJINTERP_' +
                       pick(['', 'PRINTER_', 'NET_', 'CACHE_']) +
                       pick([...ROOT, ...PRINTER, ...NET, ...CACHE])
                           .toUpperCase() + '=' + pick(VALUES));
            break;
        case 1:
            lines.push('unenv DJINTERP_' + pick(['', 'PRINTER_']) +
                       pick([...ROOT, ...PRINTER]).toUpperCase());
            break;
        case 2:
            lines.push(file());
            break;
        case 3:
            lines.push((next(4) === 0) ? 'nofile' : command());
            break;
        default:
            lines.push(command());
            break;
    }
}

process.stdout.write(lines.join('\n') + '\n');
