/*******************************************************************************
* djinterp.js [tests]                                                 session.js
*
*   tools/session.c, over the port: reads the same lines, carries each out
* against the same fixture through the port's functions, and writes what
* they answered in the same words. A transcript recorded from session.c
* replays through `runSession`; the port passes when the bytes agree.
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
*                                                            revised: 2026.11.16
*******************************************************************************/

import * as djin from '../../src/modules/interp/djin.js';
import { statusName } from '../../src/option/option_common.js';
import * as optionEnv from '../../src/option/option_env.js';
import * as optionEnvRegistry from '../../src/option/option_env_registry.js';
import { formatG } from '../../src/text/real_format.js';
import { readReal } from '../../src/text/real_read.js';
import { makeFixture } from './fixture.js';

const LAYERS = 64;

/*
resultText
  A result, as "ok VALUE" or "fail CODE NAME".
*/
function resultText(
    _result
)
{
    return _result.isOk
               ? ('ok ' + _result.value)
               : ('fail ' + _result.error + ' ' + statusName(_result.error));
}

/*
textOf
  A text, escaped; "(null)" for none. The escapes are of its bytes.
*/
function textOf(
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
integerOf
  A whole number as C's strtoll reads the front of a text, base 10.
*/
function integerOf(
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
export function makeSession()
{
    const fixture     = makeFixture();
    const registry    = fixture.registry;
    const environment = new Map();
    const frameOf     = (_name) => (fixture.frames.get(_name) ?? null);
    const frameName   = (_frame) => (optionEnv.name(_frame) ?? '-');

    /*
    valueText
      A value's members, as get and layers write them.
    */
    const valueText = (_value) =>
        'kind=' + optionEnv.kindName(_value.kind) +
        ' bound=' + (_value.bound ? 1 : 0) +
        ' source=' + optionEnv.sourceName(_value.source) +
        ' depth=' + ((_value.depth === optionEnv.NONE) ? 'none'
                                                       : _value.depth) +
        ' integer=' + _value.integer +
        ' real=' + formatG(_value.real, 17) +
        ' text=' + textOf(_value.text);

    /*
    formatsText
      The value in force as format and formatQuoted write it, each with
    its length in bytes.
    */
    const formatsText = (_frame, _scope, _var) =>
    {
        const plain  = optionEnv.format(_frame, _scope, _var);
        const quoted = optionEnv.formatQuoted(_frame, _scope, _var);
        const length = (_text) => ((_text === null) ? -1
                                                    : _text.length);

        return ' | ' + length(plain) + ' ' + textOf(plain) +
               ' | ' + length(quoted) + ' ' + textOf(quoted);
    };

    /*
    readValue
      A value from a kind's word and a text: what "set" binds.
    */
    const readValue = (_kind, _text) =>
    {
        if (_kind === 'bool')
        {
            return { kind: optionEnv.KIND.BOOL,
                     integer: integerOf(_text) };
        }

        if (_kind === 'real')
        {
            const read = readReal(_text);

            return { kind: optionEnv.KIND.REAL, real: read.value };
        }

        if (_kind === 'text')
        {
            return { kind: optionEnv.KIND.TEXT,
                     text: (_text === '(null)') ? null : _text };
        }

        return {
            kind:    (_kind === 'int')    ? optionEnv.KIND.INT
                   : (_kind === 'choice') ? optionEnv.KIND.CHOICE
                   : (_kind === 'flags')  ? optionEnv.KIND.FLAGS
                   : 0,
            integer: integerOf(_text)
        };
    };

    const runRegistry = (_op, _a) =>
    {
        const count = _a.length;

        if ( (_op === 'reg_assign') &&
             (count >= 4) )
        {
            return 'reg_assign ' +
                   resultText(optionEnvRegistry.assign(
                       registry, _a[2], _a[3], Number(integerOf(_a[1]))));
        }

        if ( (_op === 'reg_put') &&
             (count >= 3) )
        {
            return 'reg_put ' +
                   resultText(optionEnvRegistry.put(
                       registry, _a[2], Number(integerOf(_a[1]))));
        }

        if ( (_op === 'reg_load') &&
             (count >= 3) )
        {
            const r = optionEnvRegistry.load(registry, _a[2],
                                             Number(integerOf(_a[1])));

            return 'reg_load ' + resultText(r) +
                   (r.isOk ? '' : (' at ' + (r.errorOffset ?? 0)));
        }

        if ( (_op === 'reg_import') &&
             (count >= 2) )
        {
            return 'reg_import ' +
                   resultText(optionEnvRegistry.import(registry, _a[1],
                                                       environment));
        }

        if ( (_op === 'reg_suggest') &&
             (count >= 2) )
        {
            const near = optionEnvRegistry.suggest(registry, _a[1]);

            return 'reg_suggest ' + near.length + ' ' +
                   textOf(near);
        }

        if ( (_op === 'reg_take') &&
             (count >= 2) )
        {
            const took = optionEnvRegistry.takeOption(registry, _a, 1);

            return 'reg_take ' + took.took + ' at=' + took.at + ' ' +
                   ((took.result !== null) ? resultText(took.result)
                                           : 'ok 0');
        }

        if ( (_op === 'reg_target') &&
             (count >= 2) )
        {
            return 'reg_target ' +
                   frameName(optionEnvRegistry.target(registry, _a[1]));
        }

        if (_op === 'reg_count')
        {
            let out = 'reg_count ' + optionEnvRegistry.count(registry);

            for (let i = 0; i < optionEnvRegistry.count(registry); ++i)
            {
                out += ' ' + frameName(optionEnvRegistry.at(registry, i));
            }

            return out;
        }

        if ( (_op === 'reg_add') &&
             (count >= 2) )
        {
            return 'reg_add ' +
                   resultText(optionEnvRegistry.add(registry,
                                                    frameOf(_a[1])));
        }

        if ( (_op === 'reg_remove') &&
             (count >= 2) )
        {
            return 'reg_remove ' +
                   resultText(optionEnvRegistry.remove(registry,
                                                       frameOf(_a[1])));
        }

        if ( (_op === 'djin_register') &&
             (count >= 2) )
        {
            const status = fixture.records.has(_a[1])
                ? djin.register(fixture.set, fixture.records.get(_a[1]))
                : -1;

            return 'djin_register ' + status + ' ' +
                   djin.statusName(status);
        }

        if (_op === 'djin_list')
        {
            return djin.writeList(fixture.set) + 'djin_list 0';
        }

        if ( (_op === 'djin_describe') &&
             (count >= 2) )
        {
            const record = djin.setFind(fixture.set, _a[1]);

            return (record === null)
                       ? 'djin_describe none'
                       : (djin.writeDescription(record) +
                          'djin_describe 0');
        }

        if ( (_op === 'djin_frame') &&
             (count >= 2) )
        {
            const text = djin.writeFrame(frameOf(_a[1]));

            return (text === null) ? 'djin_frame -1'
                                   : (text + 'djin_frame 0');
        }

        if ( (_op === 'djin_command') &&
             (count >= 3) )
        {
            const command = djin.commandFind(
                                djin.setFind(fixture.set, _a[1]), _a[2]);

            return 'djin_command ' +
                   textOf((command !== null) ? command.summary : null);
        }

        return null;
    };

    const runFrame = (_op, _a) =>
    {
        const count = _a.length;
        const frame = frameOf(_a[1]);
        let   r;

        if (frame === null)
        {
            return 'no frame';
        }

        if ( (_op === 'put') &&
             (count >= 4) )
        {
            return 'put ' +
                   resultText(optionEnv.putFrom(
                       frame, _a[3], Number(integerOf(_a[2]))));
        }

        if ( (_op === 'load') &&
             (count >= 4) )
        {
            r = optionEnv.loadFrom(frame, _a[3],
                                   Number(integerOf(_a[2])));

            return 'load ' + resultText(r) +
                   (r.isOk ? '' : (' at ' + (r.errorOffset ?? 0)));
        }

        if ( (_op === 'assign') &&
             (count >= 5) )
        {
            return 'assign ' +
                   resultText(optionEnv.assignFrom(
                       frame, _a[3], _a[4], Number(integerOf(_a[2]))));
        }

        if ( (_op === 'get') &&
             (count >= 3) )
        {
            r = optionEnv.resolve(frame, _a[2]);

            if (!r.isOk)
            {
                return 'get ' + resultText(r);
            }

            return 'get id=' + r.value + ' scope=' + r.scope + ' ' +
                   valueText(optionEnv.get(frame, r.scope, r.value).got) +
                   formatsText(frame, r.scope, r.value);
        }

        if ( (_op === 'raw_get') &&
             (count >= 4) )
        {
            const s = Number(integerOf(_a[2]));
            const v = Number(integerOf(_a[3]));

            return 'raw_get ' + resultText(optionEnv.get(frame, s, v)) +
                   ' source=' + optionEnv.source(frame, s, v) +
                   formatsText(frame, s, v);
        }

        if ( (_op === 'layers') &&
             (count >= 3) )
        {
            const capacity = Math.min((count >= 4)
                                          ? Number(integerOf(_a[3]))
                                          : 8,
                                      LAYERS + 2);

            r = optionEnv.resolve(frame, _a[2]);

            if (!r.isOk)
            {
                return 'layers ' + resultText(r);
            }

            const found = optionEnv.layers(frame, r.scope, r.value,
                                           capacity);
            let   out   = 'layers ' + found.count;

            for (let i = 0; (i < found.count) && (i < capacity) &&
                            (i < LAYERS); ++i)
            {
                const layer = found.layers[i];

                out += '\n  [' + i + '] frame=' + frameName(layer.frame) +
                       ' scope=' + layer.scope +
                       ' shown=' + (layer.shown ? 1 : 0) + ' ' +
                       valueText(layer.value);
            }

            return out;
        }

        if ( (_op === 'unset') &&
             (count >= 3) )
        {
            r = optionEnv.resolve(frame, _a[2]);

            return 'unset ' +
                   resultText(r.isOk
                                  ? optionEnv.unset(frame, r.scope, r.value)
                                  : r);
        }

        if ( (_op === 'unset_from') &&
             (count >= 4) )
        {
            r = optionEnv.resolve(frame, _a[3]);

            return 'unset_from ' +
                   resultText(r.isOk
                                  ? optionEnv.unsetFrom(
                                        frame, r.scope, r.value,
                                        Number(integerOf(_a[2])))
                                  : r);
        }

        if ( (_op === 'set') &&
             (count >= 6) )
        {
            r = optionEnv.resolve(frame, _a[3]);

            return 'set ' +
                   resultText(r.isOk
                                  ? optionEnv.setValue(
                                        frame, r.scope, r.value,
                                        Number(integerOf(_a[2])),
                                        readValue(_a[4], _a[5]))
                                  : r);
        }

        if ( (_op === 'text_copy') &&
             (count >= 4) )
        {
            r = optionEnv.resolve(frame, _a[2]);

            return 'text_copy ' +
                   resultText(r.isOk
                                  ? optionEnv.setTextCopy(
                                        frame, r.scope, r.value, _a[3])
                                  : r);
        }

        if ( (_op === 'suggest') &&
             (count >= 3) )
        {
            return 'suggest ' + textOf(optionEnv.suggest(frame, _a[2]));
        }

        if (_op === 'generation')
        {
            return 'generation ' + optionEnv.generation(frame);
        }

        if (_op === 'clear')
        {
            optionEnv.clear(frame);

            return 'clear';
        }

        if (_op === 'vars')
        {
            const total = optionEnv.varCount(frame);
            let   out   = 'vars ' + total;

            for (let k = 0; k <= total; ++k)
            {
                const id  = optionEnv.varId(frame, k);
                const row = optionEnv.varAt(frame, id);

                out += '\n  [' + k + '] id=' + id +
                       ' index=' + optionEnv.varIndex(frame, id) +
                       ' name=' + ((row !== null) ? row.name : '-') +
                       ' frame=' +
                       frameName(optionEnv.varFrame(frame, id)) +
                       ' depth=' + optionEnv.idDepth(id);
            }

            return out;
        }

        if ( (_op === 'bound') &&
             (count >= 3) )
        {
            r = optionEnv.resolve(frame, _a[2]);

            if (!r.isOk)
            {
                return 'bound ' + resultText(r);
            }

            return 'bound is_bound=' +
                   (optionEnv.isBound(frame, r.scope, r.value) ? 1 : 0) +
                   ' scope_is_bound=' +
                   (optionEnv.scopeIsBound(frame, r.scope) ? 1 : 0);
        }

        if ( (_op === 'scope') &&
             (count >= 3) )
        {
            r = optionEnv.findScope(frame, _a[2]);

            return 'scope ' + resultText(r) +
                   (r.isOk ? (' name=' +
                              textOf(optionEnv.scopeName(frame, r.value)))
                           : '');
        }

        if ( (_op === 'import') &&
             (count >= 3) )
        {
            return 'import ' +
                   resultText(optionEnv.import(frame, _a[2], environment));
        }

        if ( (_op === 'attach') &&
             (count >= 3) )
        {
            return 'attach ' +
                   resultText(optionEnv.setParent(frame, frameOf(_a[2])));
        }

        if (_op === 'detach')
        {
            optionEnv.detach(frame);

            return 'detach';
        }

        if (_op === 'root')
        {
            return 'root ' + frameName(optionEnv.root(frame));
        }

        return '? ' + _op;
    };

    /*
    runLine
      One line: split at its tabs, its arguments' escapes read, and carried
    out.
    */
    const runLine = (_line) =>
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
            return 'distance ' + optionEnv.distance(a[1], a[2]);
        }

        if ( (a[0] === 'statement_end') &&
             (count >= 3) )
        {
            return 'statement_end ' +
                   optionEnv.statementEnd(a[1], Number(integerOf(a[2])));
        }

        if (a[0] === 'declare_bad')
        {
            // a frame of its own, with room for two rows
            const scratch = optionEnv.init({ bindings: 0, vars: 2,
                                             text: 0 });
            let   out     = 'declare_bad ok 0';

            for (const row of fixture.data.bad_rows.rows)
            {
                out += '\n  ' + row.name + ': ' +
                       resultText(optionEnv.declare(scratch, row));
            }

            return out;
        }

        const answered = runRegistry(a[0], a);

        if (answered !== null)
        {
            return answered;
        }

        return (count >= 2) ? runFrame(a[0], a) : ('? ' + a[0]);
    };

    // what making the fixture wrote
    let setup = 'registry ' + resultText(fixture.made) + '\n';

    for (const [f, step] of fixture.steps.entries())
    {
        setup += 'frame ' + step.name;

        if (f !== 0)
        {
            setup += ' init=ok 0 name=' + resultText(step.nameResult);
        }

        setup += ' declare=' + resultText(step.declare);

        if (step.scopes !== undefined)
        {
            setup += ' scopes=' + resultText(step.scopes);
        }

        if (step.attach !== undefined)
        {
            setup += ' attach=' + resultText(step.attach);
        }

        setup += '\n';
    }

    setup += 'djins 0\n';

    return { setup: setup,
             line:  (_line) => runLine(_line) };
}

/**
 * A whole transcript's input, replayed: what tools/session.c writes for
 * it.
 *
 * @param {string} _input  the `.in` file's bytes, as a byte string.
 * @returns {string} the `.out` file's bytes, as a byte string.
 */
export function runSession(
    _input
)
{
    const session = makeSession();
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
