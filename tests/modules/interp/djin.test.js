/*******************************************************************************
* djinterp.js [tests]                                               djin.test.js
*
*   What of the djin records is the port's own: a record as a plain object,
* its ABI where left out, and the set read back. What a record is refused
* for, and the list and the descriptions byte for byte, are in the session
* transcripts (tests/transcripts/session_djin).
*
*
* path:      /tests/modules/interp/djin.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as djin from '../../../src/modules/interp/djin.js';
import * as option_env from '../../../src/option/option_env.js';
import * as option_env_registry
    from '../../../src/option/option_env_registry.js';

const { STATUS } = djin;

test('a record is an object; its ABI is the current one where left out',
     () =>
{
    const set    = djin.set_init();
    const record = { name: 'printer', version: '1.0', summary: 'prints' };

    assert.equal(djin.register(set, record), STATUS.OK);
    assert.equal(djin.set_count(set), 1);
    assert.equal(djin.set_at(set, 0), record);
    assert.equal(djin.set_find(set, 'printer'), record);
    assert.equal(djin.set_find(set, 'nothing'), null);
    assert.equal(djin.set_at(set, 1), null);
    assert.equal(djin.register(set, { ...record, name: 'other',
                                      abi: djin.ABI + 1 }), STATUS.INVALID);
    assert.equal(djin.register(set, { ...record, name: 'other',
                                      abi: djin.ABI }), STATUS.OK);
});

test('what is refused is a status, whatever is handed in', () =>
{
    const set = djin.set_init({ reserved: ['list'] });
    const ok  = { name: 'a', version: '1', summary: 's' };

    assert.equal(djin.register(set, null), STATUS.INVALID);
    assert.equal(djin.register(null, ok), STATUS.INVALID);
    assert.equal(djin.register(set, {}), STATUS.INVALID);
    assert.equal(djin.register(set, { ...ok, name: 7 }), STATUS.INVALID);
    assert.equal(djin.register(set, { ...ok, commands: 'run' }),
                 STATUS.INVALID);
    assert.equal(djin.register(set, { ...ok, commands: [null] }),
                 STATUS.INVALID);
    assert.equal(djin.register(set, { ...ok, name: 'list' }),
                 STATUS.RESERVED);
    assert.equal(djin.register(set, ok), STATUS.OK);
    assert.equal(djin.register(set, ok), STATUS.DUPLICATE);
    assert.equal(djin.status_name(STATUS.RESERVED), 'reserved');
    assert.equal(djin.status_name(99), 'unknown');
});

test('settings need a registry, and are listed in it', () =>
{
    const registry = option_env_registry.init('app').registry;
    const settings = option_env.init();
    const record   = { name: 'printer', version: '1', summary: 's',
                       settings: settings };

    option_env.set_name(settings, 'printer');
    option_env.declare(settings, option_env.row_bool('banner', false));

    assert.equal(djin.register(djin.set_init(), record), STATUS.SETTINGS);

    const set = djin.set_init({ registry: registry });

    assert.equal(djin.register(set, record), STATUS.OK);
    assert.equal(option_env_registry.find(registry, 'printer'), settings);
    assert.equal(option_env_registry.assign(registry, 'printer.banner',
                                            'yes',
                                            option_env.SOURCE.PROGRAM).is_ok,
                 true);
});

test('commands are found by name; the writers take a record as it is',
     () =>
{
    const run    = { name: 'run', summary: 'runs it' };
    const record = { name: 'printer', version: '1', summary: 'prints',
                     commands: [run, { name: 'check-all',
                                       summary: 'checks' }] };

    assert.equal(djin.command_find(record, 'run'), run);
    assert.equal(djin.command_find(record, 'nothing'), null);
    assert.equal(djin.command_find(null, 'run'), null);
    assert.equal(djin.write_description(record),
                 'printer  1\n  prints\n\ncommands\n' +
                 '  run        runs it\n  check-all  checks\n');
    assert.equal(djin.write_description(null), null);
    assert.equal(djin.write_list(null), null);
    assert.equal(djin.write_frame(option_env.init()), null);

    const set = djin.set_init();

    djin.register(set, record);
    assert.equal(djin.write_list(set), 'printer  1  prints\n');
});

test('columns are as wide as their text\'s units', () =>
{
    const set = djin.set_init();

    djin.register(set, { name: 'a', version: '€', summary: 'x' });
    djin.register(set, { name: 'b', version: '1', summary: 'y' });

    // the euro sign is one unit, where it is three bytes in the reference,
    // whose column after it is two wider (the owner's ruling 3)
    assert.equal(djin.write_list(set), 'a  €  x\nb  1  y\n');
});
