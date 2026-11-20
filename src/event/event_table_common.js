/*******************************************************************************
* djinterp.js [event]                                      event_table_common.js
*
*   The store of bound handlers. Each binding is a LETTER -- a step under a
* key, with an id and a mask -- and the letters of one key, in the order
* they were bound, are that key's WORD. A masked-off letter stays in its
* word and acts as skip.
*   A table may be edited by a handler while a dispatch over it runs. A
* letter unbound then is kept, out of every query, until the outermost
* dispatch ends: the fold that began before the unbind still reaches it,
* and its state is released only afterwards (`state_free`). The registry
* (event_registry_common.js) does the folding and brackets it with
* `internal.dispatch_begin` and `internal.dispatch_end`.
*   What is the reference's storage is not here: its arena of slots, its
* buckets and their rehashing, its statistics and footprint. A table here
* holds its letters in bind order. It has no limit unless `table_init` is
* given one; given a capacity it reports ERR_CAPACITY when it is full, as
* the reference's fixed table does. Where the reference walks a word by
* slot index (`first`, `next`, `at`), this gives the word (`table_word`).
*   reference: inc/djinterp/c/event/event_table_common.h and
*              src/djinterp/c/event/event_table_common.c, at d20c0b23
*
*
* path:      /src/event/event_table_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The table
    1.  table_init, table_dispose, table_clear, table_clear_key
2.  Bind and unbind
    1.  table_bind, table_unbind
3.  The mask
    1.  table_enable, table_disable, table_is_enabled, table_contains
4.  Reading
    1.  table_find, table_word
    2.  table_count, table_enabled_count, table_count_for,
        table_has_entries_for, table_key_count
    3.  table_for_each, table_for_each_key
5.  Merge
    1.  table_merge
6.  For the registry
    1.  internal
*/

import { HANDLER_ID_NULL, STATUS } from './event_common.js';


//==============================================================================
// 1.  THE TABLE
//==============================================================================

/**
 * A table. Made by `table_init`; read through the functions here.
 *
 * @typedef {object} event_table
 */

/**
 * A letter, as a reader is shown one.
 *
 * @typedef {object} event_entry
 * @property {number}     id       its handler id.
 * @property {bigint}     key      the key of its word.
 * @property {event_step} step     the handler.
 * @property {boolean}    enabled  its mask.
 */

function ready(
    _table
)
{
    return ( (_table !== null)            &&
             (typeof _table === 'object') &&
             (_table.ready === true) );
}

function live(
    _entry
)
{
    return ( (_entry.id !== HANDLER_ID_NULL) &&
             !_entry.zombie );
}

// 1.1
/**
 * A table with no letters.
 *
 * @param {object} [_room]  the table's room.
 * @param {number} [_room.capacity=Infinity]  the most letters it holds,
 *        those unbound and not yet released among them.
 * @returns {event_table}
 */
export function table_init(
    _room = {}
)
{
    return {
        ready:         true,
        entries:       [],
        next_id:       1,
        count:         0,
        enabled_count: 0,
        capacity:      _room.capacity ?? Infinity,
        dispatching:   false,
        zombies:       false,
        dispose_asked: false
    };
}

/*
detach
  Takes a letter out of the table, and gives its hook and state back.
*/
function detach(
    _table,
    _entry
)
{
    _table.entries.splice(_table.entries.indexOf(_entry), 1);

    return { hook: _entry.state_free, state: _entry.step.state };
}

/*
drop
  Unbinds a letter: at once, or, while a dispatch runs, at its end.
*/
function drop(
    _table,
    _entry
)
{
    --_table.count;

    // the mask counts only while the letter is bound
    if (_entry.enabled)
    {
        --_table.enabled_count;
    }

    // mid-dispatch: defer the release to the outermost dispatch's end
    if (_table.dispatching)
    {
        _entry.zombie  = true;
        _table.zombies = true;

        return;
    }

    const { hook, state } = detach(_table, _entry);

    // the hook runs last: it may re-enter the table
    if (hook)
    {
        hook(state);
    }

    return;
}

/**
 * Unbinds every letter the table had when the call began, running each
 * one's `state_free`. Handler ids are not started again.
 *
 * @param {?event_table} _table  the table.
 */
export function table_clear(
    _table
)
{
    if (!ready(_table))
    {
        return;
    }

    const bound = _table.next_id - 1;

    for (const entry of _table.entries.slice())
    {
        if ( live(entry) &&
             (entry.id <= bound) )
        {
            drop(_table, entry);
        }
    }

    return;
}

/**
 * Unbinds every letter of one key's word.
 *
 * @param {?event_table} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {number} how many were unbound.
 */
export function table_clear_key(
    _table,
    _key
)
{
    let removed = 0;

    if (!ready(_table))
    {
        return 0;
    }

    const bound = _table.next_id - 1;

    for (const entry of _table.entries.slice())
    {
        if ( live(entry)          &&
             (entry.key === _key) &&
             (entry.id <= bound) )
        {
            drop(_table, entry);
            ++removed;
        }
    }

    return removed;
}

/**
 * Clears a table and ends it: nothing binds to it afterwards. Asked for
 * by a handler of a dispatch over it, the table is ended when the
 * outermost dispatch is.
 *
 * @param {?event_table} _table  the table.
 */
export function table_dispose(
    _table
)
{
    if ( (_table === null) ||
         (typeof _table !== 'object') )
    {
        return;
    }

    table_clear(_table);

    // mid-dispatch: the running fold still needs the letters
    if (_table.dispatching)
    {
        _table.dispose_asked = true;

        return;
    }

    _table.ready         = false;
    _table.entries       = [];
    _table.next_id       = 1;
    _table.count         = 0;
    _table.enabled_count = 0;

    return;
}


//==============================================================================
// 2.  BIND AND UNBIND
//==============================================================================

// 2.1
/**
 * Appends a letter to a key's word, its mask on.
 *
 * @param {?event_table} _table  the table.
 * @param {bigint}       _key    the key.
 * @param {event_step}   _step   the handler.
 * @param {?function(*): void} [_state_free=null]  called with the step's
 *        state when the letter is unbound or the table cleared; none for
 *        state the caller keeps.
 * @returns {{status: number, id: number}} OK and the letter's id; ERR_NULL
 *          for no table; ERR_STATE for a table that was disposed;
 *          ERR_CAPACITY for one that is full. The id is HANDLER_ID_NULL
 *          for a failure.
 */
export function table_bind(
    _table,
    _key,
    _step,
    _state_free = null
)
{
    if ( (_table === null) ||
         (typeof _table !== 'object') )
    {
        return { status: STATUS.ERR_NULL, id: HANDLER_ID_NULL };
    }

    if (!ready(_table))
    {
        return { status: STATUS.ERR_STATE, id: HANDLER_ID_NULL };
    }

    if (_table.entries.length >= _table.capacity)
    {
        return { status: STATUS.ERR_CAPACITY, id: HANDLER_ID_NULL };
    }

    const entry = {
        id:         _table.next_id,
        key:        _key,
        step:       _step ?? { fn: null, state: null },
        state_free: _state_free ?? null,
        enabled:    true,
        zombie:     false
    };

    ++_table.next_id;
    _table.entries.push(entry);
    ++_table.count;
    ++_table.enabled_count;

    return { status: STATUS.OK, id: entry.id };
}

function entry_of(
    _table,
    _id
)
{
    if (_id === HANDLER_ID_NULL)
    {
        return null;
    }

    for (const entry of _table.entries)
    {
        if ( (entry.id === _id) &&
             live(entry) )
        {
            return entry;
        }
    }

    return null;
}

/**
 * Unbinds the letter of an id from whichever word holds it, running its
 * `state_free`.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK; ERR_NOT_FOUND for no such letter; ERR_NULL for no
 *          table.
 */
export function table_unbind(
    _table,
    _id
)
{
    if (!ready(_table))
    {
        return ( (_table !== null) &&
                 (typeof _table === 'object') ) ? STATUS.ERR_NOT_FOUND
                                                : STATUS.ERR_NULL;
    }

    const entry = entry_of(_table, _id);

    if (entry === null)
    {
        return STATUS.ERR_NOT_FOUND;
    }

    drop(_table, entry);

    return STATUS.OK;
}


//==============================================================================
// 3.  THE MASK
//==============================================================================

function set_mask(
    _table,
    _id,
    _on
)
{
    if (!ready(_table))
    {
        return STATUS.ERR_NOT_FOUND;
    }

    const entry = entry_of(_table, _id);

    if (entry === null)
    {
        return STATUS.ERR_NOT_FOUND;
    }

    // already in the requested state
    if (entry.enabled === _on)
    {
        return STATUS.ERR_STATE;
    }

    entry.enabled         = _on;
    _table.enabled_count += _on ? 1 : -1;

    return STATUS.OK;
}

// 3.1
/**
 * Turns a letter's mask on.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK for a letter that was off; ERR_STATE for one
 *          already on; ERR_NOT_FOUND for no such letter.
 */
export function table_enable(
    _table,
    _id
)
{
    return set_mask(_table, _id, true);
}

/**
 * Turns a letter's mask off: it stays in its word and acts as skip.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK for a letter that was on; ERR_STATE for one
 *          already off; ERR_NOT_FOUND for no such letter.
 */
export function table_disable(
    _table,
    _id
)
{
    return set_mask(_table, _id, false);
}

/**
 * Whether a letter is bound and its mask on.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {boolean}
 */
export function table_is_enabled(
    _table,
    _id
)
{
    const entry = ready(_table) ? entry_of(_table, _id) : null;

    return ( (entry !== null) &&
             entry.enabled );
}

/**
 * Whether a letter of an id is bound in any word.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {boolean}
 */
export function table_contains(
    _table,
    _id
)
{
    return ( ready(_table) &&
             (entry_of(_table, _id) !== null) );
}


//==============================================================================
// 4.  READING
//==============================================================================

function shown(
    _entry
)
{
    return { id: _entry.id, key: _entry.key, step: _entry.step,
             enabled: _entry.enabled };
}

// 4.1
/**
 * The letter of an id.
 *
 * @param {?event_table} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {?event_entry} the letter; null for no such letter.
 */
export function table_find(
    _table,
    _id
)
{
    const entry = ready(_table) ? entry_of(_table, _id) : null;

    return (entry !== null) ? shown(entry) : null;
}

/**
 * A key's word: its letters in the order they were bound.
 *
 * @param {?event_table} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {Array<event_entry>}
 */
export function table_word(
    _table,
    _key
)
{
    return ready(_table)
               ? _table.entries.filter((_entry) => ( live(_entry) &&
                                                    (_entry.key === _key) ))
                               .map(shown)
               : [];
}

// 4.2
/**
 * How many letters are bound, in every word.
 *
 * @param {?event_table} _table  the table.
 * @returns {number}
 */
export function table_count(
    _table
)
{
    return ready(_table) ? _table.count : 0;
}

/**
 * How many bound letters have their mask on.
 *
 * @param {?event_table} _table  the table.
 * @returns {number}
 */
export function table_enabled_count(
    _table
)
{
    return ready(_table) ? _table.enabled_count : 0;
}

/**
 * The length of a key's word.
 *
 * @param {?event_table} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {number}
 */
export function table_count_for(
    _table,
    _key
)
{
    return table_word(_table, _key).length;
}

/**
 * Whether a key's word has a letter.
 *
 * @param {?event_table} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {boolean}
 */
export function table_has_entries_for(
    _table,
    _key
)
{
    return (table_count_for(_table, _key) !== 0);
}

/**
 * How many keys have a word that is not empty.
 *
 * @param {?event_table} _table  the table.
 * @returns {number}
 */
export function table_key_count(
    _table
)
{
    return ready(_table)
               ? new Set(_table.entries.filter(live)
                                       .map((_entry) => _entry.key)).size
               : 0;
}

/*
visit
  Visits the letters that pass a test, in bind order: each time the one of
the least id above the last visited, so that a visitor may edit the table.
Letters bound after the visit began are not visited.
*/
function visit(
    _table,
    _test,
    _visitor
)
{
    let visited = 0;
    let last    = HANDLER_ID_NULL;

    if ( !ready(_table) ||
         (typeof _visitor !== 'function') )
    {
        return 0;
    }

    const bound = _table.next_id - 1;

    for (;;)
    {
        const entry = _table.entries.find((_entry) => ( live(_entry)       &&
                                                        (_entry.id > last)  &&
                                                        (_entry.id <= bound) &&
                                                        _test(_entry) ));

        if (entry === undefined)
        {
            break;
        }

        last = entry.id;
        ++visited;

        if (!_visitor(shown(entry)))
        {
            break;
        }
    }

    return visited;
}

// 4.3
/**
 * Visits every bound letter in ascending id order, which is the order
 * they were bound in, whatever their keys.
 *
 * @param {?event_table} _table    the table.
 * @param {function(event_entry): boolean} _visitor  shown each letter;
 *        false stops the walk.
 * @returns {number} how many were visited.
 */
export function table_for_each(
    _table,
    _visitor
)
{
    return visit(_table, () => true, _visitor);
}

/**
 * Visits one key's word, in word order.
 *
 * @param {?event_table} _table    the table.
 * @param {bigint}       _key      the key.
 * @param {function(event_entry): boolean} _visitor  shown each letter;
 *        false stops the walk.
 * @returns {number} how many were visited.
 */
export function table_for_each_key(
    _table,
    _key,
    _visitor
)
{
    return visit(_table, (_entry) => (_entry.key === _key), _visitor);
}


//==============================================================================
// 5.  MERGE
//==============================================================================

// 5.1
/**
 * Appends every letter of another table to this one, key by key, this
 * one's letters first. The merged letters are given new ids; each keeps
 * its mask. They borrow their state: `state_free` is not copied, since
 * two tables must not both release one state. The other table is left as
 * it was.
 *
 * @param {?event_table} _table  the table merged into.
 * @param {?event_table} _other  the table merged from.
 * @returns {{status: number, merged: number}} OK; ERR_NULL for a table
 *          missing; ERR_CAPACITY for a table that filled, with in
 *          `merged` how far the merge got: it is not undone.
 */
export function table_merge(
    _table,
    _other
)
{
    let merged = 0;

    if ( (_table === null) || (typeof _table !== 'object') ||
         (_other === null) || (typeof _other !== 'object') )
    {
        return { status: STATUS.ERR_NULL, merged: 0 };
    }

    // merging the empty table is the identity
    if (!ready(_other))
    {
        return { status: STATUS.OK, merged: 0 };
    }

    // copy out first: merging a table into itself must not chase its tail
    const bound   = _other.next_id - 1;
    const letters = _other.entries.filter((_entry) => ( live(_entry) &&
                                                       (_entry.id <= bound) ))
                                  .map((_entry) => ({ ..._entry }));

    for (const letter of letters)
    {
        const bound_ = table_bind(_table, letter.key, letter.step, null);

        if (bound_.status !== STATUS.OK)
        {
            return { status: bound_.status, merged: merged };
        }

        // the mask travels with the letter
        if (!letter.enabled)
        {
            entry_of(_table, bound_.id).enabled = false;
            --_table.enabled_count;
        }

        ++merged;
    }

    return { status: STATUS.OK, merged: merged };
}


//==============================================================================
// 6.  FOR THE REGISTRY
//==============================================================================

/*
dispatch_begin
  Marks the table as dispatching; true when this is the outermost dispatch,
the one that must end it.
*/
function dispatch_begin(
    _table
)
{
    const outermost = !_table.dispatching;

    _table.dispatching = true;

    return outermost;
}

/*
dispatch_end
  When outermost: clears the mark, releases the letters unbound meanwhile,
running their hooks, and ends the table where a handler asked for that.
*/
function dispatch_end(
    _table,
    _outermost
)
{
    // only the dispatch that set the mark ends it
    if (!_outermost)
    {
        return;
    }

    _table.dispatching = false;

    // reap: release every zombie, looking again after each hook
    if (_table.zombies)
    {
        _table.zombies = false;

        for (;;)
        {
            const entry = _table.entries.find((_entry) => _entry.zombie);

            if (entry === undefined)
            {
                break;
            }

            const { hook, state } = detach(_table, entry);

            if (hook)
            {
                hook(state);
            }
        }
    }

    // a handler asked for the table to be disposed
    if (_table.dispose_asked)
    {
        _table.dispose_asked = false;
        table_dispose(_table);
    }

    return;
}

// 6.1
/**
 * What the registry's fold needs of a table and a reader does not: the
 * letters themselves, and the bracket around a dispatch.
 */
export const internal = Object.freeze({
    ready:          ready,
    dispatch_begin: dispatch_begin,
    dispatch_end:   dispatch_end
});
