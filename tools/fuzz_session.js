/*******************************************************************************
* djinterp.js [tools]                                            fuzz_session.js
*
*   Writes the input of a session transcript that nobody typed:
*     node tools/fuzz_session.js SEED COUNT > tests/transcripts/session_X.in
*   COUNT lines for tools/session.c, each put together from the fixture's
* names, near misses of them, values of every kind in and out of range,
* sources that are and are not, and pieces of statements, by a generator
* whose every number follows from SEED. The same SEED and COUNT give the
* same file, so a transcript made from one can be made again.
*   What the reference answers to such lines is recorded like any other
* transcript, and the port must answer the same. The lines are not meant
* to be sensible; they are meant to reach what a person typing would not.
*
*
* path:      /tools/fuzz_session.js
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

const FRAMES = ['app', 'app', 'printer', 'printer', 'net', 'cache',
                'printer_two', 'tiny', 'nothing'];
const NAMES  = ['color', 'width', 'ratio', 'title', 'depth', 'max_depth',
                'key_width', 'style', 'format', 'select', 'prefix',
                'banner', 'seed', 'scale', 'module', 'verbose', 'host',
                'port', 'p', 'mode', 'bits', 'big', 'size', 'path', 't',
                'u', 'n'];
const SCOPES = ['debug', 'cpp_features', 'summary', 'local', 'nothing'];
const DJINS  = ['app', 'printer', 'net', 'cache', 'printer_two', 'tiny',
                'djinterp'];
const VALUES = ['0', '1', '-1', '2', '3', '7', '8', '16', '30', '64', '65',
                '80', '99', '100', '120', '121', '200', '240', '600', '601',
                '4096', '8080', '65535', '65536', '0x10', '0b101', '0o17',
                '017', '0x', '9007199254740992', '9007199254740993',
                '9223372036854775807', '-9223372036854775808',
                '9223372036854775808', '4294967296', '0x100000000',
                'true', 'false', 'yes', 'no', 'on', 'off', 'Y', 'n', 'TRUE',
                'plain', 'json', 'table', 'grid', 'xml', 'JSON', 'yaml',
                'none', 'c', 'cpp', 'posix', 'all', 'wide', 'legacy',
                'c,cpp', 'c|posix', '+c', '-cpp', '+wide,-c', '-all',
                'c legacy', 'a', 'b', 'sign', 'a|b', 'a,sign', 'off',
                'huge', 'low', 'unbounded', 'shallow', 'auto',
                '0.5', '1.5', '-2.75', '1e21', '1e-7', '.5', '5.', '1e',
                'inf', '-inf', 'nan', 'NaN', 'infinity', '1e309',
                '0.1', '3.14159', '1e15', '2.5e-5', '5e-324',
                'hello', 'two words', ' padded ', '', 'a;b', 'a#b',
                '"quoted"', '"a b"', '"a\\"b"', '"\\x41"', '"\\q"', '"open',
                '"a" b', '""', '" "', '"\\0x"', '"tab\\t"', '\\', 'it\'s',
                'caf\xC3\xA9', '\xFF', 'x=y', '=', '-', '.'];
const KINDS  = ['bool', 'int', 'real', 'text', 'choice', 'flags', 'none'];
const PREFIX = ['APP_', 'APP_', '', 'X_'];

/*
mangle
  A name, as it is most of the time, or a near miss of it.
*/
function mangle(
    _name
)
{
    const at = next(_name.length + 1);

    switch (next(12))
    {
        case 0:  return _name.slice(0, at) + _name.slice(at + 1);
        case 1:  return _name.slice(0, at) + pick(['x', '_', 'e', 'i']) +
                        _name.slice(at);
        case 2:  return (at + 1 < _name.length)
                     ? (_name.slice(0, at) + _name[at + 1] + _name[at] +
                        _name.slice(at + 2))
                     : _name;
        case 3:  return _name.toUpperCase();
        default: return _name;
    }
}

/*
written
  A name as written: bare, after a scope, after a frame, or after both.
*/
function written()
{
    const name = mangle(pick(NAMES));

    switch (next(10))
    {
        case 0:  return mangle(pick(SCOPES)) + '.' + name;
        case 1:  return mangle(pick(DJINS)) + '.' + name;
        case 2:  return mangle(pick(DJINS)) + '.' + mangle(pick(SCOPES)) +
                        '.' + name;
        case 3:  return pick(['', '.', name + '.', '.' + name]);
        default: return name;
    }
}

/*
statement
  A statement: an assignment most of the time.
*/
function statement()
{
    const space = () => pick(['', ' ', ' ', '  ', '\\t']);

    switch (next(12))
    {
        case 0:  return '-' + written();
        case 1:  return written();
        case 2:  return space() + '-' + space() + written();
        case 3:  return written() + ' ' + pick(VALUES);
        default: return space() + written() + space() + '=' + space() +
                        pick(VALUES) + space();
    }
}

const source = () => pick(['1', '1', '2', '3', '4', '5', '5', '0', '6']);

/*
script
  A few statements, separated as a script separates them.
*/
function script()
{
    let out = '';

    for (let i = next(5) + 1; i > 0; --i)
    {
        out += statement() + pick([';', '\\n', ' ; ', ' # c\\n', '\\r\\n']);
    }

    return out;
}

const OPS = [
    () => ['put', pick(FRAMES), source(), statement()],
    () => ['put', pick(FRAMES), source(), statement()],
    () => ['put', pick(FRAMES), source(), statement()],
    () => ['load', pick(FRAMES), source(), script()],
    () => ['assign', pick(FRAMES), source(), written(), pick(VALUES)],
    () => ['assign', pick(FRAMES), source(), written(), pick(VALUES)],
    () => ['get', pick(FRAMES), written()],
    () => ['get', pick(FRAMES), written()],
    () => ['get', pick(FRAMES), written()],
    () => ['layers', pick(FRAMES), written(), pick(['8', '8', '1', '3',
                                                    '0', '64'])],
    () => ['layers', pick(FRAMES), written()],
    () => ['unset', pick(FRAMES), written()],
    () => ['unset_from', pick(FRAMES), source(), written()],
    () => ['set', pick(FRAMES), source(), written(), pick(KINDS),
           pick(VALUES)],
    () => ['text_copy', pick(FRAMES), written(), pick(VALUES)],
    () => ['suggest', pick(FRAMES), written()],
    () => ['generation', pick(FRAMES)],
    () => ['bound', pick(FRAMES), written()],
    () => ['scope', pick(FRAMES), mangle(pick(SCOPES))],
    () => ['vars', pick(FRAMES)],
    () => ['raw_get', pick(FRAMES),
           pick(['0', '1', '2', '1048577', '1048578', '2097153']),
           pick(['0', '1', '4', '5', '1048576', '1048578', '1048584',
                 '1048585', '2097152', '2097153', '268435456'])],
    () => ['env', pick(PREFIX) +
                  pick(['', 'PRINTER_', 'NET_', 'CACHE_', 'PRINTER_TWO_']) +
                  pick(NAMES).toUpperCase(), pick(VALUES)],
    () => ['unenv', pick(PREFIX) + pick(NAMES).toUpperCase()],
    () => ['import', pick(FRAMES), pick(PREFIX)],
    () => ['reg_import', pick(PREFIX)],
    () => ['reg_assign', source(), written(), pick(VALUES)],
    () => ['reg_put', source(), statement()],
    () => ['reg_load', source(), script()],
    () => ['reg_suggest', written()],
    () => ['reg_target', written()],
    () => ['reg_take', '--' + pick(['', 'no-', 'no-', 'set']) + written() +
                       pick(['', '', '=' + pick(VALUES)])],
    () => ['reg_take', '--set', written() + pick(['', '=' + pick(VALUES)])],
    () => ['distance', mangle(pick(NAMES)), mangle(pick(NAMES))],
    // an offset within any script: past a script's end the reference reads
    // what is not the script's
    () => ['statement_end', script(), String(next(3))],
    () => ['clear', pick(FRAMES)],
    () => ['attach', pick(['tiny', 'tiny', 'printer_two', 'cache']),
           pick(['app', 'printer', 'net', 'printer_two', 'tiny', '-'])],
    () => ['detach', pick(['tiny', 'printer_two'])],
    () => ['reg_remove', pick(['net', 'cache', 'tiny', 'printer'])],
    () => ['reg_add', pick(['net', 'cache', 'tiny', 'printer', 'app'])],
    () => ['reg_count'],
    () => ['djin_register', pick(['printer', 'net', 'plain', 'cache_named',
                                  'upper', 'reserved', 'wrong_frame',
                                  'printer_again'])],
    () => ['djin_list'],
    () => ['djin_describe', pick(DJINS)],
    () => ['djin_frame', pick(FRAMES)]
];

const lines = [];

for (let i = 0; i < count; ++i)
{
    lines.push(pick(OPS)().join('\t'));
}

process.stdout.write(Buffer.from(lines.join('\n') + '\n', 'latin1'));
