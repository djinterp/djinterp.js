/*******************************************************************************
* djinterp.js [tests]                                          generated.test.js
*
*   The reference's data is in generated/ twice where src/ imports it: as
* the JSON a tool wrote from the C, and as a module made from that JSON
* (tools/json_module.js), since a page imports modules. The two are to say
* the same.
*
*
* path:      /tests/generated.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.16
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import event from '../generated/event.js';
import option from '../generated/option.js';
import { generated } from './support/fixture.js';

test('a generated module holds what its JSON holds', () =>
{
    assert.deepEqual(option, generated('option.json'));
    assert.deepEqual(event, generated('event.json'));
});

test('every generated file names one commit of the reference', () =>
{
    const commit = generated('option.json').reference;

    assert.match(commit, /^[0-9a-f]{8,40}$/);

    for (const name of ['event.json', 'fixture.json', 'program.json'])
    {
        assert.equal(generated(name).reference, commit, name);
    }
});
