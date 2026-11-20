/**
 * The bit of a row's `refused` for a source.
 *
 * @param {number} _source  the source.
 * @returns {number} the bit.
 */
export function refuses(_source: number): number;
/**
 * The depth of the frame an id belongs to.
 *
 * @param {number} _id  a variable's or a scope's id.
 * @returns {number} the depth.
 */
export function idDepth(_id: number): number;
/**
 * An id's place among its frame's own variables, or scopes from 1.
 *
 * @param {number} _id  a variable's or a scope's id.
 * @returns {number} the place.
 */
export function idIndex(_id: number): number;
/**
 * A kind's name; "unknown" for a value that is none.
 *
 * @param {number} _kind  the kind.
 * @returns {string} the name.
 */
export function kindName(_kind: number): string;
/**
 * A source's name; "unknown" for a value that is none.
 *
 * @param {number} _source  the source.
 * @returns {string} the name.
 */
export function sourceName(_source: number): string;
/**
 * A row: what a frame declares a variable from. The reference's struct
 * dj_option_env_var, member for member; a member left out is the
 * reference's zero, but `minimum` and `maximum`, which are the least and
 * the greatest 64-bit integers.
 *
 * @typedef {object} OptionRow
 * @property {string}  name     an identifier.
 * @property {number}  kind     one of KIND.
 * @property {?string} [help]   a line about it.
 * @property {?string} [alias]  a second name, an identifier.
 * @property {?string} [knob]   the compile-time knob its default is.
 * @property {?Array<{name: string, value: (number|bigint|string)}>}
 *           [names]    its named values.
 * @property {?Array<{name: string, value: (number|bigint|string)}>}
 *           [unbuilt]  named values that are ruled and not built.
 * @property {?string} [text]   a TEXT's default.
 * @property {number|bigint|string} [integer]  the default of every other
 *           kind but REAL; a string is a decimal integer.
 * @property {number|bigint|string} [minimum]  an INT's least value.
 * @property {number|bigint|string} [maximum]  an INT's greatest value.
 * @property {number|string} [real]  a REAL's default.
 * @property {number}  [refused]  the sources it refuses, by `refuses`.
 */
/**
 * A bool row: D_OPTION_ENV_BOOL.
 *
 * @param {string}  _name     its name.
 * @param {boolean|number} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowBool(_name: string, _default: boolean | number, _help?: string | null): OptionRow;
/**
 * An int row that accepts any 64-bit value: D_OPTION_ENV_INT. Its values
 * are bigints.
 *
 * @param {string}  _name     its name.
 * @param {number|bigint} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowInt(_name: string, _default: number | bigint, _help?: string | null): OptionRow;
/**
 * An int row that accepts [minimum, maximum] only: D_OPTION_ENV_INT_RANGE.
 *
 * @param {string}  _name     its name.
 * @param {number|bigint} _default  its default.
 * @param {number|bigint} _minimum  its least value.
 * @param {number|bigint} _maximum  its greatest value.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowIntRange(_name: string, _default: number | bigint, _minimum: number | bigint, _maximum: number | bigint, _help?: string | null): OptionRow;
/**
 * A real row: D_OPTION_ENV_REAL.
 *
 * @param {string}  _name     its name.
 * @param {number}  _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowReal(_name: string, _default: number, _help?: string | null): OptionRow;
/**
 * A text row; its default may be null: D_OPTION_ENV_TEXT.
 *
 * @param {string}  _name     its name.
 * @param {?string} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowText(_name: string, _default: string | null, _help?: string | null): OptionRow;
/**
 * A choice row over named values: D_OPTION_ENV_CHOICE.
 *
 * @param {string}  _name     its name.
 * @param {Array<{name: string, value: (number|bigint)}>} _names  its
 *        values.
 * @param {number|bigint} _default  its default, one of them.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowChoice(_name: string, _names: Array<{
    name: string;
    value: (number | bigint);
}>, _default: number | bigint, _help?: string | null): OptionRow;
/**
 * A flags row over named bits: D_OPTION_ENV_FLAGS.
 *
 * @param {string}  _name     its name.
 * @param {Array<{name: string, value: (number|bigint)}>} _names  its
 *        bits.
 * @param {number|bigint} _default  its default, of those bits.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowFlags(_name: string, _names: Array<{
    name: string;
    value: (number | bigint);
}>, _default: number | bigint, _help?: string | null): OptionRow;
/**
 * A frame. Made by `init`; its members are the machine's own, and are read
 * through the functions here.
 *
 * @typedef {object} OptionEnv
 * @property {?OptionEnv} parent  the frame it inherits from; null for none.
 * @property {Array<OptionDecl>} vars  the rows it declares, in order.
 * @property {Array<?string>} scopes  its scopes' names, by index.
 * @property {?string} name  its name; null for none.
 * @property {Map<string, OptionCell>} cells  its bindings, by scope,
 *           source and variable (`cellKey`).
 * @property {number} bindingCapacity  the most bindings it holds.
 * @property {number} varCapacity      the most rows it declares.
 * @property {number} textCapacity     the most text it keeps, counted as
 *           the reference counts its block.
 * @property {number} textUsed         the text it keeps now.
 * @property {number} generation       moves with every change a reader
 *           could see.
 * @property {number} depth            its parents, counted.
 * @property {number} childCount       the frames whose parent it is.
 */
/**
 * A row as a frame holds it (`normalize`): the reference's struct, member
 * for member, its texts checked and its integers BigInt.
 *
 * @typedef {object} OptionDecl
 * @property {OptionRow} row  the caller's row it was declared from.
 * @property {?string} name   an identifier.
 * @property {?string} help   a line about it.
 * @property {?string} alias  a second name.
 * @property {?string} knob   the compile-time knob its default is.
 * @property {?Array<{name: ?string, value: bigint}>} names  its named
 *           values.
 * @property {?Array<{name: ?string, value: bigint}>} unbuilt  named values
 *           that are ruled and not built.
 * @property {?string} text     a TEXT's default.
 * @property {bigint}  integer  the default of every other kind but REAL.
 * @property {bigint}  minimum  an INT's least value.
 * @property {bigint}  maximum  an INT's greatest value.
 * @property {number}  real     a REAL's default.
 * @property {number}  name_count     how many of `names` there are.
 * @property {number}  unbuilt_count  how many of `unbuilt` there are.
 * @property {number}  kind     one of KIND.
 * @property {number}  refused  the sources it refuses, by `refuses`.
 * @property {boolean} exact    whether every value it can hold is an exact
 *           integer of a double, and so handed out as a number.
 */
/**
 * A binding, as a frame holds it.
 *
 * @typedef {object} OptionCell
 * @property {number} scope   its scope's index.
 * @property {number} source  one of SOURCE.
 * @property {number} var     its variable's id.
 * @property {bigint} integer its value, for every kind but REAL and TEXT.
 * @property {number} real    a REAL's value.
 * @property {?{chars: string, arena: boolean}} text  a TEXT's value: kept
 *           in the frame's text where `arena` is set.
 */
/**
 * A frame with no variables, scopes, bindings, parent or name.
 *
 * The reference's frame is given its storage; this one is given at most
 * its sizes, and has no limit where it is given none.
 *
 * @param {object} [_room]  how much the frame holds.
 * @param {number} [_room.bindings=Infinity]  bindings.
 * @param {number} [_room.vars=Infinity]      variables it declares.
 * @param {number} [_room.text=Infinity]      units of text it keeps
 *        copies of, each with a terminator, as the reference counts them.
 * @returns {OptionEnv} the frame.
 */
export function init(_room?: {
    bindings?: number;
    vars?: number;
    text?: number;
}): OptionEnv;
/**
 * A frame made from its record in the reference's data, as
 * tools/rows_json.c writes one: with the room the reference's own frame
 * has, its name, its rows and its scopes, so that it is full where the
 * reference's is (the owner's ruling 5 of 2026-11-16). The port's own.
 *
 * @param {{name?: ?string, bindings?: number, vars?: number,
 *          text?: number, rows?: Array<OptionRow>,
 *          scopes?: Array<string>}} _record  the frame's record. Room it
 *        does not give is not limited.
 * @returns {OptionResult & {env?: OptionEnv}} OK, and the frame in `env`;
 *          or what the reference refuses of it first: its name, a row,
 *          or its scopes.
 * @throws {TypeError} for what is no record.
 */
export function fromRecord(_record: {
    name?: string | null;
    bindings?: number;
    vars?: number;
    text?: number;
    rows?: Array<OptionRow>;
    scopes?: Array<string>;
}): OptionResult & {
    env?: OptionEnv;
};
/**
 * Declares a variable in a frame.
 *
 * @param {OptionEnv} _env  the frame.
 * @param {OptionRow} _row  the row; kept, and what `varAt` gives.
 * @returns {OptionResult} the variable's id; INVALID_ARGUMENT for a row
 *          that is not well formed -- a name or alias that is no
 *          identifier, a kind that is none, a default the row itself would
 *          refuse; KEY_DUPLICATE for a name or alias the frame has;
 *          CAPACITY for a frame that is full.
 */
export function declare(_env: OptionEnv, _row: OptionRow): OptionResult;
/**
 * Declares each row of a table, stopping at the first the frame refuses.
 *
 * @param {OptionEnv}        _env   the frame.
 * @param {Array<OptionRow>} _rows  the rows.
 * @returns {OptionResult} the id of the first, or the refusal.
 */
export function declareAll(_env: OptionEnv, _rows: Array<OptionRow>): OptionResult;
/**
 * Names a frame's scopes; they replace any it had.
 *
 * @param {OptionEnv}    _env    the frame.
 * @param {Array<string>} _names  the scopes' names, in order.
 * @returns {OptionResult} the id of the first.
 */
export function setScopes(_env: OptionEnv, _names: Array<string>): OptionResult;
/**
 * Puts a frame under a parent, or under none. Its bindings are dropped: a
 * binding's key carries its variable's depth, which this changes.
 *
 * @param {OptionEnv}  _env     the frame; one with no children.
 * @param {?OptionEnv} _parent  the parent, or null.
 * @returns {OptionResult} INVALID_ARGUMENT for a frame with children or
 *          a parent that is the frame or under it; CAPACITY for a parent
 *          at the greatest depth.
 */
export function setParent(_env: OptionEnv, _parent: OptionEnv | null): OptionResult;
/**
 * Names a frame: what qualifies its variables, as in "printer.style".
 *
 * @param {OptionEnv} _env   the frame.
 * @param {?string}    _name  an identifier, or null for no name.
 * @returns {OptionResult}
 */
export function setName(_env: OptionEnv, _name: string | null): OptionResult;
/**
 * Drops every binding of a frame's own.
 *
 * @param {OptionEnv} _env  the frame.
 */
export function clear(_env: OptionEnv): void;
/**
 * Takes a frame from under its parent.
 *
 * @param {OptionEnv} _env  the frame.
 */
export function detach(_env: OptionEnv): void;
/**
 * A count that moves whenever what a frame sees may have changed: its own
 * and its ancestors', summed.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {number} the count, of 32 bits.
 */
export function generation(_env: OptionEnv | null): number;
/**
 * The frame at the top of a frame's chain.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {?OptionEnv} the root; null for no frame.
 */
export function root(_env: OptionEnv | null): OptionEnv | null;
/**
 * A frame's name. The reference reads the frame's member; a frame here
 * holds its name itself, so this hands it out.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {?string} the name; null for none, and for no frame.
 */
export function name(_env: OptionEnv | null): string | null;
/**
 * How many variables a frame sees: its own and its ancestors'.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {number} the count.
 */
export function varCount(_env: OptionEnv | null): number;
/**
 * The id of the variable at a place among those a frame sees, the root's
 * first.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _index  the place, from 0.
 * @returns {number} the id; NONE past the last.
 */
export function varId(_env: OptionEnv | null, _index: number): number;
/**
 * A variable's place among those a frame sees: `varId`'s inverse.
 *
 * @param {?OptionEnv} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {number} the place; NONE for an id the frame does not see.
 */
export function varIndex(_env: OptionEnv | null, _var: number): number;
/**
 * A variable's row: the object it was declared from.
 *
 * @param {?OptionEnv} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {?OptionRow} the row; null for an id the frame does not see.
 */
export function varAt(_env: OptionEnv | null, _var: number): OptionRow | null;
/**
 * The frame that declares a variable.
 *
 * @param {?OptionEnv} _env  a frame that sees it.
 * @param {number}      _var  the variable's id.
 * @returns {?OptionEnv} the frame; null for an id `_env` does not see.
 */
export function varFrame(_env: OptionEnv | null, _var: number): OptionEnv | null;
/**
 * A scope's name.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id.
 * @returns {?string} the name; null for GLOBAL or an id the frame does not
 *          see.
 */
export function scopeName(_env: OptionEnv | null, _scope: number): string | null;
/**
 * The variable of a name or an alias, the innermost frame's first.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name, with no frame or scope before it.
 * @returns {OptionResult} the id, or KEY_ABSENT.
 */
export function find(_env: OptionEnv | null, _name: string): OptionResult;
/**
 * The scope of a name, the innermost frame's first.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the scope's name.
 * @returns {OptionResult} the id, or KEY_ABSENT.
 */
export function findScope(_env: OptionEnv | null, _name: string): OptionResult;
/**
 * The variable and the scope a written name means: "name", "scope.name",
 * and either after the frame's own name and a point.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {OptionResult & {scope: number}} the variable's id, and in
 *          `scope` the scope's, GLOBAL where none is written; KEY_ABSENT
 *          for a scope or a variable the frame does not see.
 */
export function resolve(_env: OptionEnv | null, _name: string): OptionResult & {
    scope: number;
};
/**
 * How far a text is from a name: the edits -- a character put in, taken
 * out or changed, or two neighbours swapped -- that make one the other,
 * without regard to ASCII case.
 *
 * @param {string} _name  the name.
 * @param {string} _text  the text.
 * @returns {number} the distance; 9 where either is longer than 63 units.
 */
export function distance(_name: string, _text: string): number;
/**
 * The name a mistyped one was probably meant to be: the nearest name or
 * alias the frame sees, within one edit for a name of up to three
 * characters and two for a longer; for "scope.name" with an unknown scope,
 * the nearest scope.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {?string} the name, bare; null where none is near.
 */
export function suggest(_env: OptionEnv | null, _name: string): string | null;
/**
 * A value: the reference's struct dj_option_env_value.
 *
 * @typedef {object} OptionValue
 * @property {?string} text     a TEXT's value; a CHOICE's or an INT's
 *           value's name, where it has one; else null.
 * @property {number|bigint} integer  the value of a BOOL (0 or 1), an INT,
 *           a CHOICE or FLAGS: a number where every value the row can hold
 *           is an exact integer of a double, else a bigint.
 * @property {number}  real     a REAL's value.
 * @property {number}  kind     the variable's kind.
 * @property {boolean} bound    whether a binding gave it; false for the
 *           row's default.
 * @property {number}  source   the source of that binding; DEFAULT for
 *           none.
 * @property {number}  depth    the depth of the frame it was bound in;
 *           NONE for none.
 */
/**
 * The value in force for a variable in a scope.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {OptionResult & {got?: OptionValue}} the id, and in `got`
 *          the value; KEY_ABSENT for an id the frame does not see.
 */
export function get(_env: OptionEnv | null, _scope: number, _var: number): OptionResult & {
    got?: OptionValue;
};
/**
 * A BOOL's value in force; false for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {boolean}
 */
export function bool(_env: OptionEnv | null, _scope: number, _var: number): boolean;
/**
 * The value in force of an INT, a CHOICE or FLAGS; 0 for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number|bigint} a number or a bigint, as the row's values are.
 */
export function int(_env: OptionEnv | null, _scope: number, _var: number): number | bigint;
/**
 * A REAL's value in force; 0 for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number}
 */
export function real(_env: OptionEnv | null, _scope: number, _var: number): number;
/**
 * A TEXT's value in force, or the name of a CHOICE's or an INT's; null for
 * anything else, and for a value with no text.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string}
 */
export function text(_env: OptionEnv | null, _scope: number, _var: number): string | null;
/**
 * The source of the value in force.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number} the source; -1 for an id the frame does not see.
 */
export function source(_env: OptionEnv | null, _scope: number, _var: number): number;
/**
 * Whether a frame itself binds a variable in exactly a scope, from any
 * source.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {boolean}
 */
export function isBound(_env: OptionEnv | null, _scope: number, _var: number): boolean;
/**
 * Whether a frame or an ancestor binds anything in exactly a scope.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @returns {boolean}
 */
export function scopeIsBound(_env: OptionEnv | null, _scope: number): boolean;
/**
 * Every binding that bears on a variable in a scope, the one in force
 * first and the rest in the order they would come into force: what a
 * reader asked "why is it this?" is shown.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {number}      [_capacity=64]  the most layers to give; the
 *        reference gives at most 64.
 * @returns {{count: number, layers: Array<{frame: OptionEnv,
 *            scope: number, shown: boolean, value: OptionValue}>}}
 *          `count` is how many bindings bear, which may be more than are
 *          given; -1, with no layers, for an id the frame does not see.
 *          `shown` marks the one in force.
 */
export function layers(_env: OptionEnv | null, _scope: number, _var: number, _capacity?: number): {
    count: number;
    layers: Array<{
        frame: OptionEnv;
        scope: number;
        shown: boolean;
        value: OptionValue;
    }>;
};
/**
 * Binds a BOOL, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {boolean}    _value  the value.
 * @returns {OptionResult} the id; VALUE_TYPE_MISMATCH for a variable of
 *          another kind; POLICY_REJECTED for a row that refuses the
 *          program; CAPACITY for a frame that is full.
 */
export function setBool(_env: OptionEnv, _scope: number, _var: number, _value: boolean): OptionResult;
/**
 * Binds an INT, a CHOICE or FLAGS, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number|bigint} _value  the value; a number must be a whole one
 *        that is exact.
 * @returns {OptionResult} the id; INVALID_ARGUMENT for a value the row
 *          does not accept; POLICY_REJECTED for one that is named and not
 *          built.
 */
export function setInt(_env: OptionEnv, _scope: number, _var: number, _value: number | bigint): OptionResult;
/**
 * Binds a REAL, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number}     _value  the value.
 * @returns {OptionResult} the id.
 */
export function setReal(_env: OptionEnv, _scope: number, _var: number, _value: number): OptionResult;
/**
 * Binds a TEXT, as the program. The reference keeps the caller's pointer
 * and counts none of the frame's text room; so does this.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {?string}    _value  the text, or null.
 * @returns {OptionResult} the id.
 */
export function setText(_env: OptionEnv, _scope: number, _var: number, _value: string | null): OptionResult;
/**
 * Binds a variable to a value, from a source.
 *
 * @param {OptionEnv} _env     the frame the binding is made in.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @param {{kind: number, integer?: (number|bigint|boolean), real?: number,
 *          text?: ?string}} _value  the value: its
 *        kind, and the member that kind reads.
 * @returns {OptionResult} the id; INVALID_ARGUMENT for no value or a
 *          source that is none; VALUE_TYPE_MISMATCH for a kind that is not
 *          the variable's.
 */
export function setValue(_env: OptionEnv, _scope: number, _var: number, _source: number, _value: {
    kind: number;
    integer?: (number | bigint | boolean);
    real?: number;
    text?: string | null;
}): OptionResult;
/**
 * Binds a TEXT to a copy of a text, as the program: the copy counts
 * against the frame's text room.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {string}     _value  the text.
 * @returns {OptionResult} the id; BUFFER_TOO_SMALL for a frame with no
 *          room for it.
 */
export function setTextCopy(_env: OptionEnv, _scope: number, _var: number, _value: string): OptionResult;
/**
 * Drops a frame's own bindings of a variable in exactly a scope, from
 * every source.
 *
 * @param {OptionEnv} _env    the frame.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @returns {OptionResult} the id, whether or not anything was bound.
 */
export function unset(_env: OptionEnv, _scope: number, _var: number): OptionResult;
/**
 * Drops a frame's own binding of a variable in exactly a scope, from one
 * source.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} the id, whether or not anything was bound.
 */
export function unsetFrom(_env: OptionEnv, _scope: number, _var: number, _source: number): OptionResult;
/**
 * Unbinds everything a frame holds bound at one source, in every scope.
 * The port's own: the reference's program has no need of it, since what
 * a process bound from its command line ends with the process, and a
 * page's program does not end (src/djinterp.js, `run`).
 *
 * @param {OptionEnv} _env     the frame; its own bindings only, not its
 *        ancestors'.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} how many bindings went.
 */
export function unsetSource(_env: OptionEnv, _source: number): OptionResult;
/**
 * Binds a variable by its written name from a value's text, from a source.
 * The value is read as the variable's kind reads one: a BOOL from "true",
 * "yes", "on", "y", "1" and their opposites; an INT from a number in base
 * 10, 0x, 0o or 0b, or the name of one of its named values; a REAL from
 * what C's strtod reads, less the hexadecimal form; a CHOICE from a name
 * or a number; FLAGS from names separated by ',' or '|', each perhaps
 * after '+' or '-'; a TEXT from the text as it is.
 *
 * @param {OptionEnv} _env     the frame the binding is made in.
 * @param {string}     _name    the name: "name" or "scope.name", perhaps
 *        after the frame's own name and a point.
 * @param {string}     _value   the value's text.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} the variable's id; KEY_ABSENT for a name the
 *          frame does not see; INVALID_ARGUMENT for a text that is not a
 *          value of the kind, or one the row does not accept;
 *          POLICY_REJECTED for a named value that is not built, or a
 *          source the row refuses.
 */
export function assignFrom(_env: OptionEnv, _name: string, _value: string, _source: number): OptionResult;
/**
 * `assignFrom`, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {string}     _name   the name as written.
 * @param {string}     _value  the value's text.
 * @returns {OptionResult}
 */
export function assign(_env: OptionEnv, _name: string, _value: string): OptionResult;
/**
 * Carries out one statement, from a source: "name = value" binds; "name"
 * binds a BOOL true; "-name" drops the source's binding. A value in double
 * quotes may hold \" \\ \' \n \r \t \0 and \xHH, and must end the
 * statement.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement; read up to a NUL.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {OptionResult} the variable's id; INVALID_ARGUMENT for a
 *          statement with no name, with text after a bare name, or with a
 *          value the variable refuses; KEY_ABSENT for a name the frame
 *          does not see.
 */
export function putFrom(_env: OptionEnv, _statement: string, _source: number): OptionResult;
/**
 * `putFrom`, as the program.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement.
 * @returns {OptionResult}
 */
export function put(_env: OptionEnv, _statement: string): OptionResult;
/**
 * `putFrom` for a statement given whole, a NUL in it included: the
 * reference's form for text that carries its length.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {OptionResult}
 */
export function putNFrom(_env: OptionEnv, _statement: string, _source: number): OptionResult;
/**
 * Where the statement that starts at an offset ends: at the next ';',
 * line break or '#' outside double quotes, or the script's end.
 *
 * @param {string} _script  the script.
 * @param {number} _at      where the statement starts, an index into the
 *        script.
 * @returns {number} the index of its end.
 */
export function statementEnd(_script: string, _at: number): number;
/**
 * Carries out a script, from a source: statements separated by ';' or a
 * line break, with '#' starting a comment that runs to its line's end. It
 * stops at the first statement refused; those before it stay carried out.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {string}     _script  the script; read up to a NUL.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult & {errorOffset?: number}} how many statements
 *          were carried out; or the refusal, with in `errorOffset` where
 *          the refused statement starts, an index into the script.
 */
export function loadFrom(_env: OptionEnv, _script: string, _source: number): OptionResult & {
    errorOffset?: number;
};
/**
 * `loadFrom`, as the program.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {string}     _script  the script.
 * @returns {OptionResult & {errorOffset?: number}}
 */
export function load(_env: OptionEnv, _script: string): OptionResult & {
    errorOffset?: number;
};
/**
 * Binds, as the environment, every variable a frame sees that the
 * environment names: PREFIX and the row's name in upper case, or its
 * alias's. A value refused does not stop the rest.
 *
 * The reference reads the process's environment. A page has none, so the
 * environment is given: the caller decides what stands in for it.
 *
 * Exported as `import` too, the reference's name: `optionEnv.import(...)`.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {?string}    _prefix  what each variable's name follows, or null
 *        for nothing.
 * @param {Map<string, string>|Record<string, string>|
 *         function(string): (string|undefined)} _environment  the
 *        environment: names to values.
 * @returns {OptionResult} how many were bound; or the first refusal.
 */
export function import_(_env: OptionEnv, _prefix: string | null, _environment: Map<string, string> | Record<string, string> | ((arg0: string) => (string | undefined))): OptionResult;
/**
 * The value in force as text: "true" or "false"; a number; a REAL as
 * "%.17g" writes it; a TEXT as it is, and a null one as nothing; a CHOICE
 * or an INT by its value's name where it has one; FLAGS as names joined by
 * '|', the widest first, with bits no name covers in hexadecimal.
 *
 * The reference writes into a buffer and returns the length; this returns
 * the text, whole.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string} the text; null for an id the frame does not see.
 */
export function format(_env: OptionEnv | null, _scope: number, _var: number): string | null;
/**
 * `format`, with a TEXT written so that a statement reads it back: in
 * double quotes, with escapes, where it is empty, starts or ends with a
 * space or tab, or holds ';', '#', '"', a backslash or a control
 * character.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string} the text; null for an id the frame does not see.
 */
export function formatQuoted(_env: OptionEnv | null, _scope: number, _var: number): string | null;
/**
 * The value in force, read again only when the frame's generation has
 * moved since the cache was filled.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {{filled?: boolean, generation?: number, value?: OptionValue}}
 *        _cache  the caller's cache for this variable in this scope; an
 *        empty object to start with.
 * @returns {?OptionValue} the value; one of kind 0 for an id the frame
 *          does not see; null for no cache.
 */
export function cached(_env: OptionEnv | null, _scope: number, _var: number, _cache: {
    filled?: boolean;
    generation?: number;
    value?: OptionValue;
}): OptionValue | null;
/** @import { OptionResult } from './option_common.js' */
/**
 * The kinds of variable, by the reference's values.
 */
export const KIND: Readonly<{
    BOOL: 1;
    INT: 2;
    REAL: 3;
    TEXT: 4;
    CHOICE: 5;
    FLAGS: 6;
}>;
/**
 * The sources of a binding, lowest first. DEFAULT is a row's own default
 * and binds nothing.
 */
export const SOURCE: Readonly<{
    DEFAULT: 0;
    PROGRAM: 1;
    FILE: 2;
    ENVIRONMENT: 3;
    COMMAND_LINE: 4;
    OVERRIDE: 5;
}>;
/** How many sources there are. */
export const SOURCES: 6;
/** The scope that is none: a binding for every scope. */
export const GLOBAL: 0;
/** No variable: what `varId` gives past the last. */
export const NONE: 4294967295;
/** The deepest a frame may be. */
export const DEPTH_MAX: number;
/**
 * The machine without its checks of what a caller hands in: each takes
 * strings as they are, and integers as BigInt. For the modules that stand
 * on this one -- the registry, the djin writers, the program's commands.
 * `decl` gives a variable's row as the machine holds it.
 */
export const inner: Readonly<{
    cstr: typeof cstr;
    decl: (_env: any, _var: any) => any;
    isIdentifier: typeof isIdentifier;
    find: typeof findInner;
    findScope: typeof findScopeInner;
    resolve: typeof resolveInner;
    distance: typeof distanceInner;
    suggest: typeof suggestInner;
    scopeName: typeof scopeNameInner;
    get: typeof getInner;
    layers: typeof layersInner;
    assignFrom: typeof assignFromInner;
    putNFrom: typeof putNFromInner;
    loadFrom: typeof loadFromInner;
    statementEnd: typeof statementEndInner;
    import: typeof importInner;
    lookupOf: typeof lookupOf;
    format: typeof formatInner;
    formatQuoted: typeof formatQuotedInner;
    formatValue: typeof formatValue;
}>;
/**
 * A row: what a frame declares a variable from. The reference's struct
 * dj_option_env_var, member for member; a member left out is the
 * reference's zero, but `minimum` and `maximum`, which are the least and
 * the greatest 64-bit integers.
 */
export type OptionRow = {
    /**
     * an identifier.
     */
    name: string;
    /**
     * one of KIND.
     */
    kind: number;
    /**
     * a line about it.
     */
    help?: string | null;
    /**
     * a second name, an identifier.
     */
    alias?: string | null;
    /**
     * the compile-time knob its default is.
     */
    knob?: string | null;
    /**
     * its named values.
     */
    names?: Array<{
        name: string;
        value: (number | bigint | string);
    }> | null;
    /**
     * named values that are ruled and not built.
     */
    unbuilt?: Array<{
        name: string;
        value: (number | bigint | string);
    }> | null;
    /**
     * a TEXT's default.
     */
    text?: string | null;
    /**
     * the default of every other
     * kind but REAL; a string is a decimal integer.
     */
    integer?: number | bigint | string;
    /**
     * an INT's least value.
     */
    minimum?: number | bigint | string;
    /**
     * an INT's greatest value.
     */
    maximum?: number | bigint | string;
    /**
     * a REAL's default.
     */
    real?: number | string;
    /**
     * the sources it refuses, by `refuses`.
     */
    refused?: number;
};
/**
 * A frame. Made by `init`; its members are the machine's own, and are read
 * through the functions here.
 */
export type OptionEnv = {
    /**
     * the frame it inherits from; null for none.
     */
    parent: OptionEnv | null;
    /**
     * the rows it declares, in order.
     */
    vars: Array<OptionDecl>;
    /**
     * its scopes' names, by index.
     */
    scopes: Array<string | null>;
    /**
     * its name; null for none.
     */
    name: string | null;
    /**
     * its bindings, by scope,
     * source and variable (`cellKey`).
     */
    cells: Map<string, OptionCell>;
    /**
     * the most bindings it holds.
     */
    bindingCapacity: number;
    /**
     * the most rows it declares.
     */
    varCapacity: number;
    /**
     * the most text it keeps, counted as
     * the reference counts its block.
     */
    textCapacity: number;
    /**
     * the text it keeps now.
     */
    textUsed: number;
    /**
     * moves with every change a reader
     * could see.
     */
    generation: number;
    /**
     * its parents, counted.
     */
    depth: number;
    /**
     * the frames whose parent it is.
     */
    childCount: number;
};
/**
 * A row as a frame holds it (`normalize`): the reference's struct, member
 * for member, its texts checked and its integers BigInt.
 */
export type OptionDecl = {
    /**
     * the caller's row it was declared from.
     */
    row: OptionRow;
    /**
     * an identifier.
     */
    name: string | null;
    /**
     * a line about it.
     */
    help: string | null;
    /**
     * a second name.
     */
    alias: string | null;
    /**
     * the compile-time knob its default is.
     */
    knob: string | null;
    /**
     * its named
     * values.
     */
    names: Array<{
        name: string | null;
        value: bigint;
    }> | null;
    /**
     * named values
     * that are ruled and not built.
     */
    unbuilt: Array<{
        name: string | null;
        value: bigint;
    }> | null;
    /**
     * a TEXT's default.
     */
    text: string | null;
    /**
     * the default of every other kind but REAL.
     */
    integer: bigint;
    /**
     * an INT's least value.
     */
    minimum: bigint;
    /**
     * an INT's greatest value.
     */
    maximum: bigint;
    /**
     * a REAL's default.
     */
    real: number;
    /**
     * how many of `names` there are.
     */
    name_count: number;
    /**
     * how many of `unbuilt` there are.
     */
    unbuilt_count: number;
    /**
     * one of KIND.
     */
    kind: number;
    /**
     * the sources it refuses, by `refuses`.
     */
    refused: number;
    /**
     * whether every value it can hold is an exact
     * integer of a double, and so handed out as a number.
     */
    exact: boolean;
};
/**
 * A binding, as a frame holds it.
 */
export type OptionCell = {
    /**
     * its scope's index.
     */
    scope: number;
    /**
     * one of SOURCE.
     */
    source: number;
    /**
     * its variable's id.
     */
    var: number;
    /**
     * its value, for every kind but REAL and TEXT.
     */
    integer: bigint;
    /**
     * a REAL's value.
     */
    real: number;
    /**
     * a TEXT's value: kept
     * in the frame's text where `arena` is set.
     */
    text: {
        chars: string;
        arena: boolean;
    } | null;
};
/**
 * A value: the reference's struct dj_option_env_value.
 */
export type OptionValue = {
    /**
     * a TEXT's value; a CHOICE's or an INT's
     * value's name, where it has one; else null.
     */
    text: string | null;
    /**
     * the value of a BOOL (0 or 1), an INT,
     * a CHOICE or FLAGS: a number where every value the row can hold
     * is an exact integer of a double, else a bigint.
     */
    integer: number | bigint;
    /**
     * a REAL's value.
     */
    real: number;
    /**
     * the variable's kind.
     */
    kind: number;
    /**
     * whether a binding gave it; false for the
     * row's default.
     */
    bound: boolean;
    /**
     * the source of that binding; DEFAULT for
     * none.
     */
    source: number;
    /**
     * the depth of the frame it was bound in;
     * NONE for none.
     */
    depth: number;
};
import type { OptionResult } from './option_common.js';
declare function cstr(_text: any): any;
declare function isIdentifier(_text: any): boolean;
declare function findInner(_env: any, _name: any): OptionResult;
declare function findScopeInner(_env: any, _name: any): OptionResult;
declare function resolveInner(_env: any, _name: any): {
    scope: number;
    isOk: boolean;
    value?: number;
    error?: number;
};
declare function distanceInner(_name: any, _text: any): any;
declare function suggestInner(_env: any, _name: any): any;
declare function scopeNameInner(_env: any, _scope: any): any;
/**
 * d_option_env_get, its value's text and its integer a BigInt.
 *
 * @returns {OptionResult & {got?: *, decl?: *, scope?: number}}
 */
declare function getInner(_env: any, _scope: any, _var: any): OptionResult & {
    got?: any;
    decl?: any;
    scope?: number;
};
declare function layersInner(_env: any, _scope: any, _var: any, _capacity: any): {
    count: number;
    layers: any[];
    decl: any;
};
declare function assignFromInner(_env: any, _name: any, _value: any, _source: any): OptionResult;
declare function putNFromInner(_env: any, _statement: any, _source: any): OptionResult;
declare function loadFromInner(_env: any, _script: any, _source: any): OptionResult | {
    errorOffset: number;
    isOk: boolean;
    value?: number;
    error?: number;
};
declare function statementEndInner(_script: any, _at: any): any;
declare function importInner(_env: any, _prefix: any, _lookup: any): OptionResult;
declare function lookupOf(_environment: any): (_key: any) => any;
declare function formatInner(_env: any, _scope: any, _var: any): any;
declare function formatQuotedInner(_env: any, _scope: any, _var: any): any;
declare function formatValue(_decl: any, _value: any): any;
export { import_ as import, _import as import };
