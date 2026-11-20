/*******************************************************************************
* djinterp.js [tests]                                                 session.js
*
*   tools/session.c, over the port: reads the same lines, carries each out
* against the same fixture through the port's functions, and writes what
* they answered in the same words. A transcript recorded from session.c
* replays through `run_session`; the port passes when the bytes agree.
*   The lines and what each writes are set out in tools/session.c. This
* file follows it operation for operation, in its order.
*   Input and output are strings with a unit for each of the transcript's
* bytes: the port counts text in UTF-16 units where the reference counts
* bytes, so a byte to a unit is how the two are set side by side.
*
*
* path:      /tests/support/session.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import * as djin from '../../src/modules/interp/djin.js';
import { status_name } from '../../src/option/option_common.js';
import * as option_env from '../../src/option/option_env.js';
import * as option_env_registry from '../../src/option/option_env_registry.js';
import { format_g } from '../../src/text/real_format.js';
import { read_real } from '../../src/text/real_read.js';
import { make_fixture } from './fixture.js';

const LAYERS = 64;

/*
result_text
  A result, as "ok VALUE" or "fail CODE NAME".
*/
function result_text(
    _result
)
{
    return _result.is_ok
               ? ('ok ' + _result.value)
               : ('fail ' + _result.error + ' ' + status_name(_result.error));
}

/*
text_of
  A text, escaped; "(null)" for none. The escapes are of its bytes.
*/
function text_of(
    _text
)
{
    if ( (_text === null) ||
         (_text === undefined) )
    {
        return '(null)';
    }

    let out = '';

    for (const c of _text)
    {
        const code = c.charCodeAt(0);

        out += (c === '\\') ? '\\\\'
             : (c === '\n') ? '\\n'
             : (c === '\t') ? '\\t'
             : (c === '\r') ? '\\r'
             : ( (code < 0x20) || (code === 0x7F) )
                   ? ('\\x' + code.toString(16).toUpperCase()
                                  .padStart(2, '0'))
             : c;
    }

    return out;
}

/*
unescape
  An argument's escapes, read: of bytes, to bytes.
*/
function unescape(
    _bytes
)
{
    let out = '';

    for (let i = 0; i < _bytes.length; ++i)
    {
        if ( (_bytes[i] !== '\\') ||
             (i + 1 >= _bytes.length) )
        {
            out += _bytes[i];

            continue;
        }

        ++i;

        switch (_bytes[i])
        {
            case 'n': out += '\n'; break;
            case 't': out += '\t'; break;
            case 'r': out += '\r'; break;
            case 'x':
                if (i + 2 < _bytes.length)
                {
                    out += String.fromCharCode(
                               parseInt(_bytes.slice(i + 1, i + 3), 16) || 0);
                    i   += 2;
                }
                break;
            default:  out += _bytes[i]; break;
        }
    }

    return out;
}

/*
integer_of
  A whole number as C's strtoll reads the front of a text, base 10.
*/
function integer_of(
    _text
)
{
    const match = /^[ \t]*([+-]?[0-9]+)/.exec(_text);
    const value = (match !== null) ? BigInt(match[1]) : 0n;
    const low   = -(1n << 63n);
    const high  = (1n << 63n) - 1n;

    return (value < low) ? low : (value > high) ? high : value;
}

/**
 * A session over the fixture: `line` carries out one line and returns what
 * it wrote; `setup` is what making the fixture wrote.
 *
 * @returns {{setup: string, line: function(string): string}} both in
 *          strings whose bytes are the transcript's.
 */
export function make_session()
{
    const fixture     = make_fixture();
    const registry    = fixture.registry;
    const environment = new Map();
    const frame_of    = (_name) => (fixture.frames.get(_name) ?? null);
    const frame_name  = (_frame) => (option_env.name(_frame) ?? '-');

    /*
    value_text
      A value's members, as get and layers write them.
    */
    const value_text = (_value) =>
        'kind=' + option_env.kind_name(_value.kind) +
        ' bound=' + (_value.bound ? 1 : 0) +
        ' source=' + option_env.source_name(_value.source) +
        ' depth=' + ((_value.depth === option_env.NONE) ? 'none'
                                                        : _value.depth) +
        ' integer=' + _value.integer +
        ' real=' + format_g(_value.real, 17) +
        ' text=' + text_of(_value.text);

    /*
    formats_text
      The value in force as format and format_quoted write it, each with
    its length in bytes.
    */
    const formats_text = (_frame, _scope, _var) =>
    {
        const plain  = option_env.format(_frame, _scope, _var);
        const quoted = option_env.format_quoted(_frame, _scope, _var);
        const length = (_text) => ((_text === null) ? -1
                                                    : _text.length);

        return ' | ' + length(plain) + ' ' + text_of(plain) +
               ' | ' + length(quoted) + ' ' + text_of(quoted);
    };

    /*
    read_value
      A value from a kind's word and a text: what "set" binds.
    */
    const read_value = (_kind, _text) =>
    {
        if (_kind === 'bool')
        {
            return { kind: option_env.KIND.BOOL,
                     integer: integer_of(_text) };
        }

        if (_kind === 'real')
        {
            const read = read_real(_text);

            return { kind: option_env.KIND.REAL, real: read.value };
        }

        if (_kind === 'text')
        {
            return { kind: option_env.KIND.TEXT,
                     text: (_text === '(null)') ? null : _text };
        }

        return {
            kind:    (_kind === 'int')    ? option_env.KIND.INT
                   : (_kind === 'choice') ? option_env.KIND.CHOICE
                   : (_kind === 'flags')  ? option_env.KIND.FLAGS
                   : 0,
            integer: integer_of(_text)
        };
    };

    const run_registry = (_op, _a) =>
    {
        const count = _a.length;

        if ( (_op === 'reg_assign') &&
             (count >= 4) )
        {
            return 'reg_assign ' +
                   result_text(option_env_registry.assign(
                       registry, _a[2], _a[3], Number(integer_of(_a[1]))));
        }

        if ( (_op === 'reg_put') &&
             (count >= 3) )
        {
            return 'reg_put ' +
                   result_text(option_env_registry.put(
                       registry, _a[2], Number(integer_of(_a[1]))));
        }

        if ( (_op === 'reg_load') &&
             (count >= 3) )
        {
            const r = option_env_registry.load(registry, _a[2],
                                               Number(integer_of(_a[1])));

            return 'reg_load ' + result_text(r) +
                   (r.is_ok ? '' : (' at ' + (r.error_offset ?? 0)));
        }

        if ( (_op === 'reg_import') &&
             (count >= 2) )
        {
            return 'reg_import ' +
                   result_text(option_env_registry.import(registry, _a[1],
                                                          environment));
        }

        if ( (_op === 'reg_suggest') &&
             (count >= 2) )
        {
            const near = option_env_registry.suggest(registry, _a[1]);

            return 'reg_suggest ' + near.length + ' ' +
                   text_of(near);
        }

        if ( (_op === 'reg_take') &&
             (count >= 2) )
        {
            const took = option_env_registry.take_option(registry, _a, 1);

            return 'reg_take ' + took.took + ' at=' + took.at + ' ' +
                   ((took.result !== null) ? result_text(took.result)
                                           : 'ok 0');
        }

        if ( (_op === 'reg_target') &&
             (count >= 2) )
        {
            return 'reg_target ' +
                   frame_name(option_env_registry.target(registry, _a[1]));
        }

        if (_op === 'reg_count')
        {
            let out = 'reg_count ' + option_env_registry.count(registry);

            for (let i = 0; i < option_env_registry.count(registry); ++i)
            {
                out += ' ' + frame_name(option_env_registry.at(registry, i));
            }

            return out;
        }

        if ( (_op === 'reg_add') &&
             (count >= 2) )
        {
            return 'reg_add ' +
                   result_text(option_env_registry.add(registry,
                                                       frame_of(_a[1])));
        }

        if ( (_op === 'reg_remove') &&
             (count >= 2) )
        {
            return 'reg_remove ' +
                   result_text(option_env_registry.remove(registry,
                                                          frame_of(_a[1])));
        }

        if ( (_op === 'djin_register') &&
             (count >= 2) )
        {
            const status = fixture.records.has(_a[1])
                ? djin.register(fixture.set, fixture.records.get(_a[1]))
                : -1;

            return 'djin_register ' + status + ' ' +
                   djin.status_name(status);
        }

        if (_op === 'djin_list')
        {
            return djin.write_list(fixture.set) + 'djin_list 0';
        }

        if ( (_op === 'djin_describe') &&
             (count >= 2) )
        {
            const record = djin.set_find(fixture.set, _a[1]);

            return (record === null)
                       ? 'djin_describe none'
                       : (djin.write_description(record) +
                          'djin_describe 0');
        }

        if ( (_op === 'djin_frame') &&
             (count >= 2) )
        {
            const text = djin.write_frame(frame_of(_a[1]));

            return (text === null) ? 'djin_frame -1'
                                   : (text + 'djin_frame 0');
        }

        if ( (_op === 'djin_command') &&
             (count >= 3) )
        {
            const command = djin.command_find(
                                djin.set_find(fixture.set, _a[1]), _a[2]);

            return 'djin_command ' +
                   text_of((command !== null) ? command.summary : null);
        }

        return null;
    };

    const run_frame = (_op, _a) =>
    {
        const count = _a.length;
        const frame = frame_of(_a[1]);
        let   r;

        if (frame === null)
        {
            return 'no frame';
        }

        if ( (_op === 'put') &&
             (count >= 4) )
        {
            return 'put ' +
                   result_text(option_env.put_from(
                       frame, _a[3], Number(integer_of(_a[2]))));
        }

        if ( (_op === 'load') &&
             (count >= 4) )
        {
            r = option_env.load_from(frame, _a[3],
                                     Number(integer_of(_a[2])));

            return 'load ' + result_text(r) +
                   (r.is_ok ? '' : (' at ' + (r.error_offset ?? 0)));
        }

        if ( (_op === 'assign') &&
             (count >= 5) )
        {
            return 'assign ' +
                   result_text(option_env.assign_from(
                       frame, _a[3], _a[4], Number(integer_of(_a[2]))));
        }

        if ( (_op === 'get') &&
             (count >= 3) )
        {
            r = option_env.resolve(frame, _a[2]);

            if (!r.is_ok)
            {
                return 'get ' + result_text(r);
            }

            return 'get id=' + r.value + ' scope=' + r.scope + ' ' +
                   value_text(option_env.get(frame, r.scope, r.value).got) +
                   formats_text(frame, r.scope, r.value);
        }

        if ( (_op === 'raw_get') &&
             (count >= 4) )
        {
            const s = Number(integer_of(_a[2]));
            const v = Number(integer_of(_a[3]));

            return 'raw_get ' + result_text(option_env.get(frame, s, v)) +
                   ' source=' + option_env.source(frame, s, v) +
                   formats_text(frame, s, v);
        }

        if ( (_op === 'layers') &&
             (count >= 3) )
        {
            const capacity = Math.min((count >= 4)
                                          ? Number(integer_of(_a[3]))
                                          : 8,
                                      LAYERS + 2);

            r = option_env.resolve(frame, _a[2]);

            if (!r.is_ok)
            {
                return 'layers ' + result_text(r);
            }

            const found = option_env.layers(frame, r.scope, r.value,
                                            capacity);
            let   out   = 'layers ' + found.count;

            for (let i = 0; (i < found.count) && (i < capacity) &&
                            (i < LAYERS); ++i)
            {
                const layer = found.layers[i];

                out += '\n  [' + i + '] frame=' + frame_name(layer.frame) +
                       ' scope=' + layer.scope +
                       ' shown=' + (layer.shown ? 1 : 0) + ' ' +
                       value_text(layer.value);
            }

            return out;
        }

        if ( (_op === 'unset') &&
             (count >= 3) )
        {
            r = option_env.resolve(frame, _a[2]);

            return 'unset ' +
                   result_text(r.is_ok
                                   ? option_env.unset(frame, r.scope, r.value)
                                   : r);
        }

        if ( (_op === 'unset_from') &&
             (count >= 4) )
        {
            r = option_env.resolve(frame, _a[3]);

            return 'unset_from ' +
                   result_text(r.is_ok
                                   ? option_env.unset_from(
                                         frame, r.scope, r.value,
                                         Number(integer_of(_a[2])))
                                   : r);
        }

        if ( (_op === 'set') &&
             (count >= 6) )
        {
            r = option_env.resolve(frame, _a[3]);

            return 'set ' +
                   result_text(r.is_ok
                                   ? option_env.set_value(
                                         frame, r.scope, r.value,
                                         Number(integer_of(_a[2])),
                                         read_value(_a[4], _a[5]))
                                   : r);
        }

        if ( (_op === 'text_copy') &&
             (count >= 4) )
        {
            r = option_env.resolve(frame, _a[2]);

            return 'text_copy ' +
                   result_text(r.is_ok
                                   ? option_env.set_text_copy(
                                         frame, r.scope, r.value, _a[3])
                                   : r);
        }

        if ( (_op === 'suggest') &&
             (count >= 3) )
        {
            return 'suggest ' + text_of(option_env.suggest(frame, _a[2]));
        }

        if (_op === 'generation')
        {
            return 'generation ' + option_env.generation(frame);
        }

        if (_op === 'clear')
        {
            option_env.clear(frame);

            return 'clear';
        }

        if (_op === 'vars')
        {
            const total = option_env.var_count(frame);
            let   out   = 'vars ' + total;

            for (let k = 0; k <= total; ++k)
            {
                const id  = option_env.var_id(frame, k);
                const row = option_env.var_at(frame, id);

                out += '\n  [' + k + '] id=' + id +
                       ' index=' + option_env.var_index(frame, id) +
                       ' name=' + ((row !== null) ? row.name : '-') +
                       ' frame=' +
                       frame_name(option_env.var_frame(frame, id)) +
                       ' depth=' + option_env.id_depth(id);
            }

            return out;
        }

        if ( (_op === 'bound') &&
             (count >= 3) )
        {
            r = option_env.resolve(frame, _a[2]);

            if (!r.is_ok)
            {
                return 'bound ' + result_text(r);
            }

            return 'bound is_bound=' +
                   (option_env.is_bound(frame, r.scope, r.value) ? 1 : 0) +
                   ' scope_is_bound=' +
                   (option_env.scope_is_bound(frame, r.scope) ? 1 : 0);
        }

        if ( (_op === 'scope') &&
             (count >= 3) )
        {
            r = option_env.find_scope(frame, _a[2]);

            return 'scope ' + result_text(r) +
                   (r.is_ok ? (' name=' +
                               text_of(option_env.scope_name(frame, r.value)))
                            : '');
        }

        if ( (_op === 'import') &&
             (count >= 3) )
        {
            return 'import ' +
                   result_text(option_env.import(frame, _a[2], environment));
        }

        if ( (_op === 'attach') &&
             (count >= 3) )
        {
            return 'attach ' +
                   result_text(option_env.set_parent(frame, frame_of(_a[2])));
        }

        if (_op === 'detach')
        {
            option_env.detach(frame);

            return 'detach';
        }

        if (_op === 'root')
        {
            return 'root ' + frame_name(option_env.root(frame));
        }

        return '? ' + _op;
    };

    /*
    run_line
      One line: split at its tabs, its arguments' escapes read, and carried
    out.
    */
    const run_line = (_line) =>
    {
        const a     = _line.split('\t').slice(0, 16)
                           .map((_field, _i) => ((_i === 0)
                                    ? _field
                                    : unescape(_field)));
        const count = a.length;

        if ( (a[0] === 'env') &&
             (count >= 3) )
        {
            environment.set(a[1], a[2]);

            return 'env';
        }

        if ( (a[0] === 'unenv') &&
             (count >= 2) )
        {
            environment.delete(a[1]);

            return 'unenv';
        }

        if ( (a[0] === 'distance') &&
             (count >= 3) )
        {
            return 'distance ' + option_env.distance(a[1], a[2]);
        }

        if ( (a[0] === 'statement_end') &&
             (count >= 3) )
        {
            return 'statement_end ' +
                   option_env.statement_end(a[1], Number(integer_of(a[2])));
        }

        if (a[0] === 'declare_bad')
        {
            // a frame of its own, with room for two rows
            const scratch = option_env.init({ bindings: 0, vars: 2,
                                              text: 0 });
            let   out     = 'declare_bad ok 0';

            for (const row of fixture.data.bad_rows.rows)
            {
                out += '\n  ' + row.name + ': ' +
                       result_text(option_env.declare(scratch, row));
            }

            return out;
        }

        const answered = run_registry(a[0], a);

        if (answered !== null)
        {
            return answered;
        }

        return (count >= 2) ? run_frame(a[0], a) : ('? ' + a[0]);
    };

    // what making the fixture wrote
    let setup = 'registry ' + result_text(fixture.made) + '\n';

    for (const [f, step] of fixture.steps.entries())
    {
        setup += 'frame ' + step.name;

        if (f !== 0)
        {
            setup += ' init=ok 0 name=' + result_text(step.name_result);
        }

        setup += ' declare=' + result_text(step.declare);

        if (step.scopes !== undefined)
        {
            setup += ' scopes=' + result_text(step.scopes);
        }

        if (step.attach !== undefined)
        {
            setup += ' attach=' + result_text(step.attach);
        }

        setup += '\n';
    }

    setup += 'djins 0\n';

    return { setup: setup,
             line:  (_line) => run_line(_line) };
}

/**
 * A whole transcript's input, replayed: what tools/session.c writes for
 * it.
 *
 * @param {string} _input  the `.in` file's bytes, as a byte string.
 * @returns {string} the `.out` file's bytes, as a byte string.
 */
export function run_session(
    _input
)
{
    const session = make_session();
    let   out     = session.setup;
    const lines   = _input.split('\n');

    // a final line break ends the last line; it does not start another
    if (lines[lines.length - 1] === '')
    {
        lines.pop();
    }

    for (let line of lines)
    {
        while (line.endsWith('\r'))
        {
            line = line.slice(0, -1);
        }

        out += '> ' + line + '\n';

        if ( (line.length === 0) ||
             (line[0] === '#') )
        {
            continue;
        }

        out += session.line(line) + '\n';
    }

    return out;
}
