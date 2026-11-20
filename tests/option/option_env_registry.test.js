/*******************************************************************************
* djinterp.js [tests]                                option_env_registry.test.js
*
*   What of the registry is the port's own: the program's registry, the
* room a registry has where it is given none, and the functions' answers
* to what is no registry. What the registry routes, refuses and suggests
* is in the session transcripts (tests/transcripts/session_registry).
*
*
* path:      /tests/option/option_env_registry.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATUS, fail } from '../../src/option/option_common.js';
import * as optionEnv from '../../src/option/option_env.js';
import * as optionEnvRegistry from '../../src/option/option_env_registry.js';
import { generated } from '../support/fixture.js';

test('the program\'s registry is one, and named "djinterp"', () =>
{
    const registry = optionEnvRegistry.registry();

    assert.equal(optionEnvRegistry.registry(), registry);
    assert.equal(optionEnv.name(optionEnvRegistry.frame(registry)),
                 'djinterp');
    assert.equal(optionEnvRegistry.count(registry), 0);
});

test('a registry has the reference\'s room where it is given none', () =>
{
    const room     = generated('option.json').registry;
    const registry = optionEnvRegistry.init('app').registry;
    const root     = optionEnvRegistry.frame(registry);

    for (let i = 0; i < room.variables; ++i)
    {
        assert.equal(optionEnv.declare(root,
                                       optionEnv.rowBool('v' + i, false))
                              .isOk, true);
    }

    assert.deepEqual(optionEnv.declare(root,
                                       optionEnv.rowBool('over', false)),
                     fail(STATUS.CAPACITY));

    for (let i = 0; i < room.djins; ++i)
    {
        const frame = optionEnv.init();

        optionEnv.setName(frame, 'd' + i);
        assert.equal(optionEnvRegistry.add(registry, frame).isOk, true);
    }

    const over = optionEnv.init();

    optionEnv.setName(over, 'over');
    assert.deepEqual(optionEnvRegistry.add(registry, over),
                     fail(STATUS.CAPACITY));

    // and other room where it is given some
    const small = optionEnvRegistry.init('app', { djins: 0 }).registry;

    assert.deepEqual(optionEnvRegistry.add(small, over),
                     fail(STATUS.CAPACITY));
});

test('a name that is no identifier leaves the root unnamed', () =>
{
    const made = optionEnvRegistry.init('not a name');

    assert.equal(made.isOk, false);
    assert.equal(made.error, STATUS.INVALID_ARGUMENT);
    assert.equal(optionEnv.name(optionEnvRegistry.frame(made.registry)),
                 null);
});

test('what is no registry is answered, not thrown at', () =>
{
    assert.equal(optionEnvRegistry.frame(null), null);
    assert.equal(optionEnvRegistry.count(null), 0);
    assert.equal(optionEnvRegistry.at(null, 0), null);
    assert.equal(optionEnvRegistry.find(null, 'a'), null);
    assert.equal(optionEnvRegistry.target({}, 'a'), null);
    assert.equal(optionEnvRegistry.suggest(null, 'a'), '');
    assert.deepEqual(optionEnvRegistry.assign(null, 'a', '1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnvRegistry.put(null, 'a = 1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnvRegistry.load(null, 'a = 1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnvRegistry.import(null, '', {}),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(optionEnvRegistry.takeOption(null, ['--a'], 0),
                     { took: 0, at: 0, result: null });
    assert.deepEqual(optionEnvRegistry.add(null, optionEnv.init()),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.equal(optionEnvRegistry.import, optionEnvRegistry.import_);
});
