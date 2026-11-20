/*******************************************************************************
* djinterp.js [tests]                                           djinterp.test.js
*
*   What a page imports: a line's words, where settings are kept, and a
* program opened, given lines and listened to. That the lines' answers are
* the reference's is in the program transcripts (tests/program.test.js);
* here is what the reference has no word on, since it has no page.
*
*
* path:      /tests/djinterp.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as djinterp from '../src/djinterp.js';

const { option_env } = djinterp;

/*
out_of
  What an open program writes for a line.
*/
async function out_of(
    _dj,
    _line
)
{
    return (await _dj.run(_line)).out;
}

/*
printer
  A djin with settings, made anew: a frame belongs to one registry.
*/
function printer()
{
    return {
        name:     'printer',
        version:  '0.9.0',
        summary:  'prints descriptions',
        commands: [{ name: 'run', summary: 'print a description' }],
        settings: djinterp.settings_frame('printer', [
            option_env.row_choice('style', [{ name: 'plain', value: 0 },
                                            { name: 'json', value: 1 }], 0,
                                  'how it is written'),
            option_env.row_int_range('key_width', 30, 1, 120,
                                     'the width of a key')
        ], ['summary'])
    };
}

const SETTINGS = [option_env.row_bool('color', true, 'coloured output'),
                  option_env.row_text('title', null, 'a title')];

test('a line\'s words', () =>
{
    const cases = [
        ['',                          []],
        ['   \t ',                    []],
        ['get',                       ['get']],
        ['  get   a\tb  ',            ['get', 'a', 'b']],
        ['set title="two words"',     ['set', 'title=two words']],
        ['set "title=two words"',     ['set', 'title=two words']],
        ['set \'title=a "b" c\'',     ['set', 'title=a "b" c']],
        ['set title="a \\"b\\" \\\\"', ['set', 'title=a "b" \\']],
        ['set title="a\\nb"',         ['set', 'title=a\\nb']],
        ['set title=a\\ b',           ['set', 'title=a\\', 'b']],
        ['a""b\'\'c',                 ['abc']],
        ['"" \'\'',                   ['', '']],
        ['set title=\'it\'"\'"\'s\'', ['set', 'title=it\'s']]
    ];

    for (const [line, words] of cases)
    {
        assert.deepEqual(djinterp.split(line), words, line);
    }

    assert.equal(djinterp.split('set title="open'), null);
    assert.equal(djinterp.split('set \'open'), null);
    assert.equal(djinterp.split('"a\\"'), null);
});

test('a settings file in memory, and one in a Storage', () =>
{
    const memory = djinterp.memory_file();

    assert.equal(memory.name, 'djinterp/settings');
    assert.equal(memory.read(), null);
    memory.write('a = 1\n');
    assert.equal(memory.read(), 'a = 1\n');
    assert.equal(djinterp.memory_file('mine', 'x').read(), 'x');

    // a Storage, as a page's localStorage is one
    const items   = new Map();
    const storage = { getItem: (_k) => (items.has(_k) ? items.get(_k) : null),
                      setItem: (_k, _v) => items.set(_k, _v) };
    const stored  = djinterp.storage_file(storage, 'app/settings');

    assert.equal(stored.name, 'app/settings');
    assert.equal(stored.read(), null);
    stored.write('b = 2\n');
    assert.equal(items.get('app/settings'), 'b = 2\n');
    assert.equal(stored.read(), 'b = 2\n');
    assert.throws(() => djinterp.storage_file(null), TypeError);
    assert.throws(() => djinterp.storage_file({}), TypeError);
});

test('open, run: the program\'s commands over a page\'s djins',
     async () =>
{
    const dj = await djinterp.open({ settings: SETTINGS,
                                     djins: [printer()] });

    assert.equal(dj.warnings, '');
    assert.deepEqual(await dj.run('list'),
                     { status: 0, out: 'printer  0.9.0  prints descriptions\n',
                       err: '' });
    assert.equal(await out_of(dj, 'describe printer'),
                 'printer  0.9.0\n  prints descriptions\n\ncommands\n' +
                 '  run  print a description\n\nsettings\n' +
                 '  printer.style      choice  plain  -  how it is written\n' +
                 '  printer.key_width  int     30     -  the width of a key\n');
    assert.equal(await out_of(dj, 'get'),
                 'color = true\n# title is unset\nprinter.style = plain\n' +
                 'printer.key_width = 30\n');
    assert.deepEqual(await dj.run('get printer.stlye'), {
        status: 2, out: '',
        err: 'djinterp: error: no setting is named \'printer.stlye\'; ' +
             'did you mean \'printer.style\'?\n'
    });
    assert.deepEqual(await dj.run('set title="open'),
                     { status: 2, out: '',
                       err: 'djinterp: error: a quote is not closed\n' });
});

test('open and run answer with promises; the port answers at once too',
     async () =>
{
    const opened = djinterp.open({ settings: SETTINGS });

    assert.ok(opened instanceof Promise);

    const dj  = await opened;
    const ran = dj.run('get color');

    assert.ok(ran instanceof Promise);
    assert.deepEqual(await ran, { status: 0, out: 'color = true\n',
                                  err: '' });

    // the same two with nothing to wait for: the port's own
    const now = djinterp.open_now({ settings: SETTINGS });

    assert.deepEqual(now.run_now('get color'),
                     { status: 0, out: 'color = true\n', err: '' });
    assert.deepEqual(await now.run('get color'), now.run_now('get color'));

    // a misuse is a throw from the one, a promise broken from the other
    assert.throws(() => dj.run_now(7), TypeError);
    await assert.rejects(dj.run(7), TypeError);
    assert.throws(() => djinterp.open_now({ djins: [{}] }), Error);
    await assert.rejects(djinterp.open({ djins: [{}] }), Error);
});

test('what is heard of a line is heard before its promise is kept',
     async () =>
{
    const dj    = await djinterp.open({ settings: SETTINGS });
    const heard = [];

    dj.on('run', (_event) =>
    {
        heard.push(_event.line);
    });

    const ran = dj.run('get color');

    assert.deepEqual(heard, ['get color']);
    await ran;
    assert.deepEqual(heard, ['get color']);
});

test('one open is one run: what a line binds stays for the next',
     async () =>
{
    const file = djinterp.memory_file();
    const dj   = await djinterp.open({ settings: SETTINGS,
                                       djins: [printer()], file: file });
    const set  = await dj.run('set printer.style=json title="two words"');

    assert.equal(set.status, 0);
    assert.equal(file.read(),
                 'printer.style = json\ntitle = two words\n');
    assert.equal(await out_of(dj, 'get --show-origin printer.style'),
                 'printer.style = json  (override)\n' +
                 '    default    plain   (default)\n');
    assert.equal(await out_of(dj, 'get --set printer.key_width=40 ' +
                                  'printer.key_width'),
                 'printer.key_width = 40\n');
    assert.equal(await out_of(dj, 'get --show-origin printer.key_width'),
                 'printer.key_width = 40  (command line)\n' +
                 '    default    30   (default)\n');

    // the page opened again reads what was kept, as the file's
    const again = await djinterp.open({ settings: SETTINGS,
                                        djins: [printer()], file: file });

    assert.equal(await out_of(again,
                              'get --show-origin printer.style title'),
                 'printer.style = json  (file)\n' +
                 '    default    plain   (default)\n' +
                 'title = two words  (file)\n' +
                 '    default    unset   (default)\n');
    assert.equal(await out_of(again, 'get printer.key_width'),
                 'printer.key_width = 30\n');
});

test('the settings file\'s refusals are warnings, with their lines',
     async () =>
{
    const file = djinterp.memory_file('page/settings',
                                      'color = no\nprinter.style = yaml\n' +
                                      'nothing = 1\n');
    const dj   = await djinterp.open({ settings: SETTINGS,
                                       djins: [printer()], file: file });

    assert.equal(dj.warnings,
                 'page/settings:2: warning: \'yaml\' is not a value ' +
                 '\'printer.style\' takes\n' +
                 'page/settings:3: warning: no setting is named ' +
                 '\'nothing\'\n');
    assert.equal(await out_of(dj, 'get --show-origin color'),
                 'color = false  (file)\n    default    true   (default)\n');
});

test('no settings file: set binds, and says it has nowhere to keep it',
     async () =>
{
    const dj = await djinterp.open({ settings: SETTINGS, file: null });

    assert.deepEqual(await dj.run('set color=no'), {
        status: 2, out: '',
        err: 'djinterp: error: the system names no home for the settings ' +
             'file\n'
    });
    assert.equal(await out_of(dj, 'get --show-origin color'),
                 'color = false  (override)\n' +
                 '    default    true   (default)\n');
});

test('a Storage that refuses is said as a file that cannot be written',
     async () =>
{
    const full = { getItem: () => null,
                   setItem: () =>
                   {
                       throw new Error('the quota has been exceeded');
                   } };
    const dj   = await djinterp.open({ settings: SETTINGS,
                                       file: djinterp.storage_file(full) });

    assert.deepEqual(await dj.run('set color=no'), {
        status: 2, out: '',
        err: 'djinterp: error: cannot write \'djinterp/settings\': the ' +
             'quota has been exceeded\n'
    });

    const closed = { getItem: () =>
                     {
                         throw new Error('access is denied');
                     },
                     setItem: () => {} };
    const shut   = await djinterp.open({
        settings: SETTINGS,
        file:     djinterp.storage_file(closed)
    });

    assert.equal(shut.warnings,
                 'djinterp: warning: cannot read \'djinterp/settings\': ' +
                 'access is denied\n');
});

test('the environment and the query, each as the source it is',
     async () =>
{
    const dj = await djinterp.open({
        settings:    SETTINGS,
        djins:       [printer()],
        environment: { DJINTERP_PRINTER_STYLE: 'json',
                       DJINTERP_COLOR: 'no',
                       DJINTERP_PRINTER_KEY_WIDTH: 'wide' },
        query:       '?printer.key_width=40&title=two+words%21&no-color' +
                     '&printer.style=yaml&nothing&%zz&'
    });

    assert.equal(dj.warnings,
                 'djinterp: warning: query: --set: \'yaml\' is not a value ' +
                 '\'printer.style\' takes\n' +
                 'djinterp: warning: query: --nothing: no setting is named ' +
                 '\'nothing\'\n' +
                 'djinterp: warning: query: \'%zz\' is not percent-encoded ' +
                 'text\n');
    assert.equal(await out_of(dj, 'get --show-origin'),
                 'color = false  (command line)\n' +
                 '    under it   false   (environment)\n' +
                 '    default    true   (default)\n' +
                 'title = two words!  (command line)\n' +
                 '    default    unset   (default)\n' +
                 'printer.style = json  (environment)\n' +
                 '    default    plain   (default)\n' +
                 'printer.key_width = 40  (command line)\n' +
                 '    default    30   (default)\n');
});

test('on and off: what the program does is heard', async () =>
{
    const dj    = await djinterp.open({ settings: SETTINGS,
                                        djins: [printer()] });
    const heard = [];
    const runs  = dj.on('run', (_event) =>
    {
        heard.push(['run', _event.line, _event.status]);
    });

    dj.on('set', (_event) =>
    {
        heard.push(['set', ..._event.names]);
    });

    await dj.run('get color');
    await dj.run('set color=no printer.style=json');
    await dj.run('set color=maybe');
    assert.deepEqual(heard, [
        ['run', 'get color', 0],
        ['set', 'color', 'printer.style'],
        ['run', 'set color=no printer.style=json', 0],
        ['run', 'set color=maybe', 2]
    ]);

    // a handler that consumes cuts off those bound after it
    const first = dj.on('custom', () => djinterp.event.VERDICT.CONSUME);

    assert.equal(dj.off(runs), true);
    assert.equal(dj.off(runs), false);
    assert.equal(dj.off(first), true);
    await dj.run('get color');
    assert.equal(heard.length, 4);
    assert.throws(() => dj.on('run', null), TypeError);
    assert.throws(() => dj.on(7, () => {}), TypeError);
});

test('frames of settings with no record; scopes of the root', async () =>
{
    const cache = djinterp.settings_frame('cache', [
        option_env.row_int_range('size', 64, 0, 4096)
    ]);
    const dj    = await djinterp.open({ settings: SETTINGS,
                                        scopes: ['debug'], frames: [cache],
                                        djins: [printer()] });

    assert.equal(await out_of(dj, 'list'),
                 'printer  0.9.0  prints descriptions\n' +
                 'cache    -      settings only\n');
    assert.equal(await out_of(dj, 'describe cache'),
                 'cache\n  settings only\n\nsettings\n' +
                 '  cache.size  int  64  -\n');

    const set = await dj.run('set debug.color=no cache.size=128 ' +
                             'printer.summary.style=json');

    assert.equal(set.status, 0);
    assert.equal(await out_of(dj, 'get color debug.color cache.size ' +
                                  'printer.style printer.summary.style'),
                 'color = true\ndebug.color = false\ncache.size = 128\n' +
                 'printer.style = plain\nprinter.summary.style = json\n');
});

test('a row or a djin the reference refuses is the page\'s mistake',
     async () =>
{
    await assert.rejects(djinterp.open({
        settings: [option_env.row_int_range('width', 700, 100, 600)]
    }), /the setting 'width' was refused \(INVALID_ARGUMENT\)/);
    await assert.rejects(djinterp.open({
        djins: [{ name: 'list', version: '1', summary: 's' }]
    }), /the djin 'list' was refused \(reserved\)/);
    await assert.rejects(djinterp.open({
        djins: [{ name: 'Printer', version: '1', summary: 's' }]
    }), /the djin 'Printer' was refused \(invalid\)/);
    assert.throws(() => djinterp.settings_frame('printer', [
        option_env.row_bool('a', false), option_env.row_bool('a', true)
    ]), /the row 'printer.a' was refused \(KEY_DUPLICATE\)/);
    assert.throws(() => djinterp.settings_frame('not a name', []),
                  /was refused \(INVALID_ARGUMENT\)/);
});
