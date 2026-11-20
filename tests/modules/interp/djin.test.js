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
import * as optionEnv from '../../../src/option/option_env.js';
import * as optionEnvRegistry
    from '../../../src/option/option_env_registry.js';

const { STATUS } = djin;

test('a record is an object; its ABI is the current one where left out',
     () =>
{
    const set    = djin.setInit();
    const record = { name: 'printer', version: '1.0', summary: 'prints' };

    assert.equal(djin.register(set, record), STATUS.OK);
    assert.equal(djin.setCount(set), 1);
    assert.equal(djin.setAt(set, 0), record);
    assert.equal(djin.setFind(set, 'printer'), record);
    assert.equal(djin.setFind(set, 'nothing'), null);
    assert.equal(djin.setAt(set, 1), null);
    assert.equal(djin.register(set, { ...record, name: 'other',
                                      abi: djin.ABI + 1 }), STATUS.INVALID);
    assert.equal(djin.register(set, { ...record, name: 'other',
                                      abi: djin.ABI }), STATUS.OK);
});

test('what is refused is a status, whatever is handed in', () =>
{
    const set = djin.setInit({ reserved: ['list'] });
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
    assert.equal(djin.statusName(STATUS.RESERVED), 'reserved');
    assert.equal(djin.statusName(99), 'unknown');
});

test('settings need a registry, and are listed in it', () =>
{
    const registry = optionEnvRegistry.init('app').registry;
    const settings = optionEnv.init();
    const record   = { name: 'printer', version: '1', summary: 's',
                       settings: settings };

    optionEnv.setName(settings, 'printer');
    optionEnv.declare(settings, optionEnv.rowBool('banner', false));

    assert.equal(djin.register(djin.setInit(), record), STATUS.SETTINGS);

    const set = djin.setInit({ registry: registry });

    assert.equal(djin.register(set, record), STATUS.OK);
    assert.equal(optionEnvRegistry.find(registry, 'printer'), settings);
    assert.equal(optionEnvRegistry.assign(registry, 'printer.banner',
                                          'yes',
                                          optionEnv.SOURCE.PROGRAM).isOk,
                 true);
});

test('commands are found by name; the writers take a record as it is',
     () =>
{
    const run    = { name: 'run', summary: 'runs it' };
    const record = { name: 'printer', version: '1', summary: 'prints',
                     commands: [run, { name: 'check-all',
                                       summary: 'checks' }] };

    assert.equal(djin.commandFind(record, 'run'), run);
    assert.equal(djin.commandFind(record, 'nothing'), null);
    assert.equal(djin.commandFind(null, 'run'), null);
    assert.equal(djin.writeDescription(record),
                 'printer  1\n  prints\n\ncommands\n' +
                 '  run        runs it\n  check-all  checks\n');
    assert.equal(djin.writeDescription(null), null);
    assert.equal(djin.writeList(null), null);
    assert.equal(djin.writeFrame(optionEnv.init()), null);

    const set = djin.setInit();

    djin.register(set, record);
    assert.equal(djin.writeList(set), 'printer  1  prints\n');
});

test('columns are as wide as their text\'s units', () =>
{
    const set = djin.setInit();

    djin.register(set, { name: 'a', version: '€', summary: 'x' });
    djin.register(set, { name: 'b', version: '1', summary: 'y' });

    // the euro sign is one unit, where it is three bytes in the reference,
    // whose column after it is two wider (the owner's ruling 3)
    assert.equal(djin.writeList(set), 'a  €  x\nb  1  y\n');
});
