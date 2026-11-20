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
import * as option_env from '../../src/option/option_env.js';
import * as option_env_registry from '../../src/option/option_env_registry.js';
import { generated } from '../support/fixture.js';

test('the program\'s registry is one, and named "djinterp"', () =>
{
    const registry = option_env_registry.registry();

    assert.equal(option_env_registry.registry(), registry);
    assert.equal(option_env.name(option_env_registry.frame(registry)),
                 'djinterp');
    assert.equal(option_env_registry.count(registry), 0);
});

test('a registry has the reference\'s room where it is given none', () =>
{
    const room     = generated('option.json').registry;
    const registry = option_env_registry.init('app').registry;
    const root     = option_env_registry.frame(registry);

    for (let i = 0; i < room.variables; ++i)
    {
        assert.equal(option_env.declare(root,
                                        option_env.row_bool('v' + i, false))
                               .is_ok, true);
    }

    assert.deepEqual(option_env.declare(root,
                                        option_env.row_bool('over', false)),
                     fail(STATUS.CAPACITY));

    for (let i = 0; i < room.djins; ++i)
    {
        const frame = option_env.init();

        option_env.set_name(frame, 'd' + i);
        assert.equal(option_env_registry.add(registry, frame).is_ok, true);
    }

    const over = option_env.init();

    option_env.set_name(over, 'over');
    assert.deepEqual(option_env_registry.add(registry, over),
                     fail(STATUS.CAPACITY));

    // and other room where it is given some
    const small = option_env_registry.init('app', { djins: 0 }).registry;

    assert.deepEqual(option_env_registry.add(small, over),
                     fail(STATUS.CAPACITY));
});

test('a name that is no identifier leaves the root unnamed', () =>
{
    const made = option_env_registry.init('not a name');

    assert.equal(made.is_ok, false);
    assert.equal(made.error, STATUS.INVALID_ARGUMENT);
    assert.equal(option_env.name(option_env_registry.frame(made.registry)),
                 null);
});

test('what is no registry is answered, not thrown at', () =>
{
    assert.equal(option_env_registry.frame(null), null);
    assert.equal(option_env_registry.count(null), 0);
    assert.equal(option_env_registry.at(null, 0), null);
    assert.equal(option_env_registry.find(null, 'a'), null);
    assert.equal(option_env_registry.target({}, 'a'), null);
    assert.equal(option_env_registry.suggest(null, 'a'), '');
    assert.deepEqual(option_env_registry.assign(null, 'a', '1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env_registry.put(null, 'a = 1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env_registry.load(null, 'a = 1', 1),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env_registry.import(null, '', {}),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.deepEqual(option_env_registry.take_option(null, ['--a'], 0),
                     { took: 0, at: 0, result: null });
    assert.deepEqual(option_env_registry.add(null, option_env.init()),
                     fail(STATUS.INVALID_ARGUMENT));
    assert.equal(option_env_registry.import, option_env_registry.import_);
});
