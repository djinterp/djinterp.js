/*******************************************************************************
* djinterp.js [tools]                                                  session.c
*
*   The first source of transcripts for djinterp.js: reads lines from its
* input, carries each out against the fixture (fixture.h) through the
* reference's own functions -- option_env.h, option_env_registry.h and
* djin.h -- and writes what they answered. tests/support/session.js reads
* the same lines against the port; the port passes when the bytes agree.
*
*   A LINE is an operation and its arguments, separated by one tab each. In
* an argument a backslash escapes: \n \t \r \\ and \xHH, any byte but NUL.
* A line that is empty or starts with '#' is echoed and does nothing. Every
* line is echoed after "> ", then answered.
*   A RESULT is written "ok VALUE" or "fail CODE NAME". A text is written
* with \\ \n \t \r and \xHH for the other control characters, and "(null)"
* for none. section 2 lists the operations with what each writes.
*
*
* path:      /tools/session.c
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

#define _POSIX_C_SOURCE 200809L

// std
#include <inttypes.h>  // PRId64
#include <stdio.h>     // printf, fgets
#include <stdlib.h>    // malloc, setenv, unsetenv, strtod, strtoll
#include <string.h>    // strcmp, strlen, memset
// djinterp
#include "djinterp/c/option/option_common.h"  // results, statuses
#include "djinterp/c/util/sink_common.h"      // struct dj_pack_sink
#include "./fixture.h"                        // the fixture

#define SESSION_LINE    65536
#define SESSION_FIELDS  16
#define SESSION_LAYERS  64


//==============================================================================
// 1.  THE FIXTURE, MADE
//==============================================================================

static struct dj_option_env_registry g_registry;
static struct dj_option_env          g_frames[FX_FRAMES];
static struct dj_djin                g_djins[FX_DJINS];
static const struct dj_djin*         g_room[3];
static struct dj_djin_set            g_set;

/*
frame_of
  The fixture's frame of a name: the registry's root for the first.
*/
static struct dj_option_env*
frame_of(
    const char* _name
)
{
    for (uint32_t f = 0u; (_name != NULL) && (f < FX_FRAMES); ++f)
    {
        if (strcmp(fx_frames[f].name, _name) == 0)
        {
            return (f == 0u) ? d_option_env_registry_frame(&g_registry)
                             : &g_frames[f];
        }
    }

    return NULL;
}

/*
put_result
  A result, as "ok VALUE" or "fail CODE NAME".
*/
static void
put_result(
    struct dj_option_result _result
)
{
    if (_result.is_ok)
    {
        printf("ok %u", (unsigned)_result.payload.value);
    }
    else
    {
        const int32_t status = d_option_result_status(&_result);

        printf("fail %d %s", (int)status,
               d_option_status_name((enum dj_option_status)status));
    }

    return;
}

/*
put_text
  A text, escaped; "(null)" for none.
*/
static void
put_text(
    const char* _text
)
{
    if (_text == NULL)
    {
        fputs("(null)", stdout);

        return;
    }

    for (; *_text != '\0'; ++_text)
    {
        const unsigned char c = (unsigned char)*_text;

        switch (c)
        {
            case '\\': fputs("\\\\", stdout); break;
            case '\n': fputs("\\n", stdout);  break;
            case '\t': fputs("\\t", stdout);  break;
            case '\r': fputs("\\r", stdout);  break;
            default:
                if ( (c < 0x20u) ||
                     (c == 0x7Fu) )
                {
                    printf("\\x%02X", (unsigned)c);
                }
                else
                {
                    putchar((int)c);
                }
                break;
        }
    }

    return;
}

/*
setup
  The registry's root, then each frame over room of the fixture's size:
named, its rows declared, its scopes named, and put under its parent.
*/
static void
setup(void)
{
    struct dj_option_result r = d_option_env_registry_init(&g_registry,
                                                           fx_frames[0].name);

    printf("registry ");
    put_result(r);
    putchar('\n');

    for (uint32_t f = 0u; f < FX_FRAMES; ++f)
    {
        const struct dj_fixture_frame* const fx    = &fx_frames[f];
        struct dj_option_env*                frame = frame_of(fx->name);

        printf("frame %s", fx->name);

        if (f != 0u)
        {
            r = d_option_env_init(
                    frame,
                    (struct dj_option*)calloc(fx->bindings,
                                              sizeof(struct dj_option)),
                    (unsigned char*)calloc(fx->bindings, sizeof(uint64_t)),
                    fx->bindings,
                    (uint32_t)(fx->bindings * sizeof(uint64_t)),
                    (const struct dj_option_env_var**)
                        calloc(fx->vars, sizeof(void*)),
                    fx->vars,
                    (char*)calloc(fx->text, 1u),
                    fx->text);
            printf(" init=");
            put_result(r);
            r = d_option_env_set_name(frame, fx->name);
            printf(" name=");
            put_result(r);
        }

        r = d_option_env_declare_all(frame, fx->rows, fx->row_count);
        printf(" declare=");
        put_result(r);

        if (fx->scope_count != 0u)
        {
            r = d_option_env_set_scopes(frame, fx->scopes, fx->scope_count);
            printf(" scopes=");
            put_result(r);
        }

        if (fx->parent != NULL)
        {
            r = (fx->is_djin != 0)
                    ? d_option_env_registry_add(&g_registry, frame)
                    : d_option_env_set_parent(frame, frame_of(fx->parent));
            printf(" attach=");
            put_result(r);
        }

        putchar('\n');
    }

    // the records, their settings found by name
    for (uint32_t d = 0u; d < FX_DJINS; ++d)
    {
        g_djins[d].abi           = fx_djins[d].abi;
        g_djins[d].size          = (uint32_t)sizeof(struct dj_djin);
        g_djins[d].name          = fx_djins[d].name;
        g_djins[d].version       = fx_djins[d].version;
        g_djins[d].summary       = fx_djins[d].summary;
        g_djins[d].commands      = fx_djins[d].commands;
        g_djins[d].command_count = fx_djins[d].command_count;
        g_djins[d].settings      = frame_of(fx_djins[d].settings);
        g_djins[d].describe      = NULL;
    }

    printf("djins %d\n",
           (int)d_djin_set_init(&g_set, g_room, 3u, &g_registry,
                                fx_reserved));

    return;
}


//==============================================================================
// 2.  THE OPERATIONS
//==============================================================================

/*
unescape
  An argument's escapes, read in place.
*/
static void
unescape(
    char* _text
)
{
    char* out = _text;

    for (const char* at = _text; *at != '\0'; ++at)
    {
        if ( (*at != '\\') ||
             (at[1] == '\0') )
        {
            *out++ = *at;

            continue;
        }

        ++at;

        switch (*at)
        {
            case 'n':  *out++ = '\n'; break;
            case 't':  *out++ = '\t'; break;
            case 'r':  *out++ = '\r'; break;
            case 'x':
                if ( (at[1] != '\0') &&
                     (at[2] != '\0') )
                {
                    const char digits[3] = { at[1], at[2], '\0' };

                    *out++ = (char)(unsigned char)strtol(digits, NULL, 16);
                    at    += 2;
                }
                break;
            default:   *out++ = *at;  break;
        }
    }

    *out = '\0';

    return;
}

/*
put_value
  A value's members, as get and layers write them.
*/
static void
put_value(
    const struct dj_option_env_value* _value
)
{
    printf("kind=%s bound=%d source=%s depth=",
           d_option_env_kind_name(_value->kind), (int)_value->bound,
           d_option_env_source_name(_value->source));

    if (_value->depth == D_OPTION_ENV_NONE)
    {
        fputs("none", stdout);
    }
    else
    {
        printf("%u", (unsigned)_value->depth);
    }

    printf(" integer=%" PRId64 " real=%.17g text=", _value->integer,
           _value->real);
    put_text(_value->text);

    return;
}

/*
put_formats
  The value in force as d_option_env_format and _format_quoted write it,
each with its length.
*/
static void
put_formats(
    const struct dj_option_env* _frame,
    uint32_t                    _scope,
    uint32_t                    _var
)
{
    char   buffer[4096];
    size_t length = d_option_env_format(_frame, _scope, _var, buffer,
                                        sizeof(buffer));

    printf(" | %ld ", (length == (size_t)-1) ? -1L : (long)length);
    put_text((length == (size_t)-1) ? NULL : buffer);
    length = d_option_env_format_quoted(_frame, _scope, _var, buffer,
                                        sizeof(buffer));
    printf(" | %ld ", (length == (size_t)-1) ? -1L : (long)length);
    put_text((length == (size_t)-1) ? NULL : buffer);

    return;
}

/*
read_value
  A value from a kind's word and a text: what "set" binds.
*/
static void
read_value(
    const char*                 _kind,
    char*                       _text,
    struct dj_option_env_value* _value
)
{
    memset(_value, 0, sizeof(*_value));

    if (strcmp(_kind, "bool") == 0)
    {
        _value->kind    = D_OPTION_ENV_KIND_BOOL;
        _value->integer = strtoll(_text, NULL, 10);
    }
    else if (strcmp(_kind, "real") == 0)
    {
        _value->kind = D_OPTION_ENV_KIND_REAL;
        _value->real = strtod(_text, NULL);
    }
    else if (strcmp(_kind, "text") == 0)
    {
        _value->kind = D_OPTION_ENV_KIND_TEXT;
        _value->text = (strcmp(_text, "(null)") == 0) ? NULL : _text;
    }
    else
    {
        _value->kind    = (strcmp(_kind, "int") == 0)
                              ? D_OPTION_ENV_KIND_INT
                        : (strcmp(_kind, "choice") == 0)
                              ? D_OPTION_ENV_KIND_CHOICE
                        : (strcmp(_kind, "flags") == 0)
                              ? D_OPTION_ENV_KIND_FLAGS
                              : 0;
        _value->integer = strtoll(_text, NULL, 10);
    }

    return;
}

/*
sink_stdout
  A sink that writes to the output.
*/
static size_t
sink_stdout(
    void*       _context,
    const void* _data,
    size_t      _size
)
{
    (void)_context;

    return fwrite(_data, 1u, _size, stdout);
}

/*
frame_name
  A frame's name, or "-".
*/
static const char*
frame_name(
    const struct dj_option_env* _frame
)
{
    return ( (_frame != NULL) &&
             (_frame->name != NULL) ) ? _frame->name : "-";
}

/*
run_registry
  The operations on the registry and the djin set; 0 for a word that is
none of them.
*/
static int
run_registry(
    const char* _op,
    char**      _a,
    int         _count
)
{
    const struct dj_pack_sink out = { &sink_stdout, NULL };
    size_t                    at  = 0u;

    if ( (strcmp(_op, "reg_assign") == 0) &&
         (_count >= 4) )
    {
        printf("reg_assign ");
        put_result(d_option_env_registry_assign(&g_registry, _a[2],
                                                strlen(_a[2]), _a[3],
                                                strlen(_a[3]), atoi(_a[1])));
    }
    else if ( (strcmp(_op, "reg_put") == 0) &&
              (_count >= 3) )
    {
        printf("reg_put ");
        put_result(d_option_env_registry_put(&g_registry, _a[2],
                                             atoi(_a[1])));
    }
    else if ( (strcmp(_op, "reg_load") == 0) &&
              (_count >= 3) )
    {
        const struct dj_option_result r =
            d_option_env_registry_load(&g_registry, _a[2], atoi(_a[1]), &at);

        printf("reg_load ");
        put_result(r);

        if (!r.is_ok)
        {
            printf(" at %lu", (unsigned long)at);
        }
    }
    else if ( (strcmp(_op, "reg_import") == 0) &&
              (_count >= 2) )
    {
        printf("reg_import ");
        put_result(d_option_env_registry_import(&g_registry, _a[1]));
    }
    else if ( (strcmp(_op, "reg_suggest") == 0) &&
              (_count >= 2) )
    {
        char         buffer[512];
        const size_t length = d_option_env_registry_suggest(
                                  &g_registry, _a[1], strlen(_a[1]), buffer,
                                  sizeof(buffer));

        printf("reg_suggest %lu ", (unsigned long)length);
        put_text(buffer);
    }
    else if ( (strcmp(_op, "reg_take") == 0) &&
              (_count >= 2) )
    {
        struct dj_option_result r     = d_option_ok(0u);
        int                     index = 1;
        const int32_t           took  = d_option_env_registry_take_option(
                                            &g_registry, _count, _a, &index,
                                            &r);

        printf("reg_take %d at=%d ", (int)took, index);
        put_result(r);
    }
    else if ( (strcmp(_op, "reg_target") == 0) &&
              (_count >= 2) )
    {
        printf("reg_target %s",
               frame_name(d_option_env_registry_target(&g_registry, _a[1],
                                                       strlen(_a[1]))));
    }
    else if (strcmp(_op, "reg_count") == 0)
    {
        printf("reg_count %u", (unsigned)d_option_env_registry_count(
                                             &g_registry));

        for (uint32_t i = 0u; i < d_option_env_registry_count(&g_registry);
             ++i)
        {
            printf(" %s", frame_name(d_option_env_registry_at(&g_registry,
                                                              i)));
        }
    }
    else if ( (strcmp(_op, "reg_add") == 0) &&
              (_count >= 2) )
    {
        printf("reg_add ");
        put_result(d_option_env_registry_add(&g_registry, frame_of(_a[1])));
    }
    else if ( (strcmp(_op, "reg_remove") == 0) &&
              (_count >= 2) )
    {
        printf("reg_remove ");
        put_result(d_option_env_registry_remove(&g_registry,
                                                frame_of(_a[1])));
    }
    else if ( (strcmp(_op, "djin_register") == 0) &&
              (_count >= 2) )
    {
        int32_t status = -1;

        for (uint32_t d = 0u; d < FX_DJINS; ++d)
        {
            if (strcmp(fx_djins[d].key, _a[1]) == 0)
            {
                status = d_djin_register(&g_set, &g_djins[d]);
            }
        }

        printf("djin_register %d %s", (int)status,
               d_djin_status_name(status));
    }
    else if (strcmp(_op, "djin_list") == 0)
    {
        printf("djin_list %d", d_djin_write_list(&g_set, out));
    }
    else if ( (strcmp(_op, "djin_describe") == 0) &&
              (_count >= 2) )
    {
        const struct dj_djin* const djin = d_djin_set_find(&g_set, _a[1],
                                                           strlen(_a[1]));

        if (djin == NULL)
        {
            printf("djin_describe none");
        }
        else
        {
            printf("djin_describe %d", d_djin_write_description(djin, out));
        }
    }
    else if ( (strcmp(_op, "djin_frame") == 0) &&
              (_count >= 2) )
    {
        printf("djin_frame %d", d_djin_write_frame(frame_of(_a[1]), out));
    }
    else if ( (strcmp(_op, "djin_command") == 0) &&
              (_count >= 3) )
    {
        const struct dj_djin_command* const command =
            d_djin_command_find(d_djin_set_find(&g_set, _a[1],
                                                strlen(_a[1])),
                                _a[2], strlen(_a[2]));

        printf("djin_command ");
        put_text((command != NULL) ? command->summary : NULL);
    }
    else
    {
        return 0;
    }

    return 1;
}

/*
run_frame
  The operations on one frame: _a[1] names it.
*/
static void
run_frame(
    const char* _op,
    char**      _a,
    int         _count
)
{
    struct dj_option_env* const frame = frame_of(_a[1]);
    struct dj_option_env_value  value;
    struct dj_option_result     r;
    uint32_t                    scope = D_OPTION_ENV_GLOBAL;
    size_t                      at    = 0u;

    if (frame == NULL)
    {
        printf("no frame");

        return;
    }

    if ( (strcmp(_op, "put") == 0) &&
         (_count >= 4) )
    {
        printf("put ");
        put_result(d_option_env_put_from(frame, _a[3], atoi(_a[2])));
    }
    else if ( (strcmp(_op, "load") == 0) &&
              (_count >= 4) )
    {
        r = d_option_env_load_from(frame, _a[3], atoi(_a[2]), &at);
        printf("load ");
        put_result(r);

        if (!r.is_ok)
        {
            printf(" at %lu", (unsigned long)at);
        }
    }
    else if ( (strcmp(_op, "assign") == 0) &&
              (_count >= 5) )
    {
        printf("assign ");
        put_result(d_option_env_assign_from(frame, _a[3], strlen(_a[3]),
                                            _a[4], strlen(_a[4]),
                                            atoi(_a[2])));
    }
    else if ( (strcmp(_op, "get") == 0) &&
              (_count >= 3) )
    {
        r = d_option_env_resolve(frame, _a[2], strlen(_a[2]), &scope);
        printf("get ");

        if (!r.is_ok)
        {
            put_result(r);

            return;
        }

        (void)d_option_env_get(frame, scope, r.payload.value, &value);
        printf("id=%u scope=%u ", (unsigned)r.payload.value, (unsigned)scope);
        put_value(&value);
        put_formats(frame, scope, r.payload.value);
    }
    else if ( (strcmp(_op, "raw_get") == 0) &&
              (_count >= 4) )
    {
        const uint32_t s = (uint32_t)strtoul(_a[2], NULL, 10);
        const uint32_t v = (uint32_t)strtoul(_a[3], NULL, 10);

        r = d_option_env_get(frame, s, v, &value);
        printf("raw_get ");
        put_result(r);
        printf(" source=%d", (int)d_option_env_source(frame, s, v));
        put_formats(frame, s, v);
    }
    else if ( (strcmp(_op, "layers") == 0) &&
              (_count >= 3) )
    {
        struct dj_option_env_layer layers[SESSION_LAYERS + 2];
        size_t                     capacity = (_count >= 4)
                                                  ? (size_t)atoi(_a[3])
                                                  : 8u;
        size_t                     count;

        capacity = (capacity > SESSION_LAYERS + 2) ? (SESSION_LAYERS + 2)
                                                   : capacity;
        r        = d_option_env_resolve(frame, _a[2], strlen(_a[2]), &scope);
        printf("layers ");

        if (!r.is_ok)
        {
            put_result(r);

            return;
        }

        count = d_option_env_layers(frame, scope, r.payload.value, layers,
                                    capacity);
        printf("%lu", (unsigned long)count);

        for (size_t i = 0u; (i < count) && (i < capacity) &&
                            (i < SESSION_LAYERS); ++i)
        {
            printf("\n  [%lu] frame=%s scope=%u shown=%d ", (unsigned long)i,
                   frame_name(layers[i].frame), (unsigned)layers[i].scope,
                   (int)layers[i].shown);
            put_value(&layers[i].value);
        }
    }
    else if ( (strcmp(_op, "unset") == 0) &&
              (_count >= 3) )
    {
        r = d_option_env_resolve(frame, _a[2], strlen(_a[2]), &scope);
        printf("unset ");
        put_result(r.is_ok ? d_option_env_unset(frame, scope,
                                                r.payload.value)
                           : r);
    }
    else if ( (strcmp(_op, "unset_from") == 0) &&
              (_count >= 4) )
    {
        r = d_option_env_resolve(frame, _a[3], strlen(_a[3]), &scope);
        printf("unset_from ");
        put_result(r.is_ok ? d_option_env_unset_from(frame, scope,
                                                     r.payload.value,
                                                     atoi(_a[2]))
                           : r);
    }
    else if ( (strcmp(_op, "set") == 0) &&
              (_count >= 6) )
    {
        r = d_option_env_resolve(frame, _a[3], strlen(_a[3]), &scope);
        read_value(_a[4], _a[5], &value);
        printf("set ");
        put_result(r.is_ok ? d_option_env_set_value(frame, scope,
                                                    r.payload.value,
                                                    atoi(_a[2]), &value)
                           : r);
    }
    else if ( (strcmp(_op, "text_copy") == 0) &&
              (_count >= 4) )
    {
        r = d_option_env_resolve(frame, _a[2], strlen(_a[2]), &scope);
        printf("text_copy ");
        put_result(r.is_ok ? d_option_env_set_text_copy(frame, scope,
                                                        r.payload.value,
                                                        _a[3], strlen(_a[3]))
                           : r);
    }
    else if ( (strcmp(_op, "suggest") == 0) &&
              (_count >= 3) )
    {
        printf("suggest ");
        put_text(d_option_env_suggest(frame, _a[2], strlen(_a[2])));
    }
    else if (strcmp(_op, "generation") == 0)
    {
        printf("generation %u", (unsigned)d_option_env_generation(frame));
    }
    else if (strcmp(_op, "clear") == 0)
    {
        d_option_env_clear(frame);
        printf("clear");
    }
    else if (strcmp(_op, "vars") == 0)
    {
        const uint32_t count = d_option_env_var_count(frame);

        printf("vars %u", (unsigned)count);

        for (uint32_t k = 0u; k <= count; ++k)
        {
            const uint32_t id = d_option_env_var_id(frame, k);
            const struct dj_option_env_var* const row =
                d_option_env_var_at(frame, id);

            printf("\n  [%u] id=%u index=%u name=%s frame=%s depth=%u",
                   (unsigned)k, (unsigned)id,
                   (unsigned)d_option_env_var_index(frame, id),
                   (row != NULL) ? row->name : "-",
                   frame_name(d_option_env_var_frame(frame, id)),
                   (unsigned)D_OPTION_ENV_ID_DEPTH(id));
        }
    }
    else if ( (strcmp(_op, "bound") == 0) &&
              (_count >= 3) )
    {
        r = d_option_env_resolve(frame, _a[2], strlen(_a[2]), &scope);
        printf("bound ");

        if (!r.is_ok)
        {
            put_result(r);

            return;
        }

        printf("is_bound=%d scope_is_bound=%d",
               (int)d_option_env_is_bound(frame, scope, r.payload.value),
               (int)d_option_env_scope_is_bound(frame, scope));
    }
    else if ( (strcmp(_op, "scope") == 0) &&
              (_count >= 3) )
    {
        r = d_option_env_find_scope(frame, _a[2], strlen(_a[2]));
        printf("scope ");
        put_result(r);

        if (r.is_ok)
        {
            printf(" name=");
            put_text(d_option_env_scope_name(frame, r.payload.value));
        }
    }
    else if ( (strcmp(_op, "import") == 0) &&
              (_count >= 3) )
    {
        printf("import ");
        put_result(d_option_env_import(frame, _a[2]));
    }
    else if ( (strcmp(_op, "attach") == 0) &&
              (_count >= 3) )
    {
        printf("attach ");
        put_result(d_option_env_set_parent(frame, frame_of(_a[2])));
    }
    else if (strcmp(_op, "detach") == 0)
    {
        d_option_env_detach(frame);
        printf("detach");
    }
    else if (strcmp(_op, "root") == 0)
    {
        printf("root %s", frame_name(d_option_env_root(frame)));
    }
    else
    {
        printf("? %s", _op);
    }

    return;
}

/*
run_line
  One line: split at its tabs, its arguments' escapes read, and carried out.
*/
static void
run_line(
    char* _line
)
{
    char* a[SESSION_FIELDS + 1];
    int   count = 0;

    for (char* at = _line; (at != NULL) && (count < SESSION_FIELDS); )
    {
        char* const tab = strchr(at, '\t');

        a[count++] = at;

        if (tab != NULL)
        {
            *tab = '\0';
        }

        at = (tab != NULL) ? (tab + 1) : NULL;
    }

    a[count] = NULL;

    for (int i = 1; i < count; ++i)
    {
        unescape(a[i]);
    }

    if ( (strcmp(a[0], "env") == 0) &&
         (count >= 3) )
    {
        (void)setenv(a[1], a[2], 1);
        printf("env");
    }
    else if ( (strcmp(a[0], "unenv") == 0) &&
              (count >= 2) )
    {
        (void)unsetenv(a[1]);
        printf("unenv");
    }
    else if ( (strcmp(a[0], "distance") == 0) &&
              (count >= 3) )
    {
        printf("distance %u", (unsigned)d_option_env_distance(
                                            a[1], a[2], strlen(a[2])));
    }
    else if ( (strcmp(a[0], "statement_end") == 0) &&
              (count >= 3) )
    {
        printf("statement_end %lu",
               (unsigned long)d_option_env_statement_end(
                                  a[1], (size_t)atoi(a[2])));
    }
    else if (strcmp(a[0], "declare_bad") == 0)
    {
        // a frame of its own, with room for two rows: the third it would
        // take finds it full
        struct dj_option_env            scratch;
        const struct dj_option_env_var* vars[2];

        printf("declare_bad ");
        put_result(d_option_env_init(&scratch, NULL, NULL, 0u, 0u, vars, 2u,
                                     NULL, 0u));

        for (uint32_t i = 0u; i < FX_COUNT(fx_bad_rows); ++i)
        {
            printf("\n  %s: ", fx_bad_rows[i].name);
            put_result(d_option_env_declare(&scratch, &fx_bad_rows[i]));
        }
    }
    else if (run_registry(a[0], a, count) != 0)
    {
        // answered
    }
    else if (count >= 2)
    {
        run_frame(a[0], a, count);
    }
    else
    {
        printf("? %s", a[0]);
    }

    putchar('\n');

    return;
}

int main(void)
{
    static char line[SESSION_LINE];

    setup();

    while (fgets(line, sizeof(line), stdin) != NULL)
    {
        size_t length = strlen(line);

        while ( (length > 0u) &&
                ( (line[length - 1u] == '\n') ||
                  (line[length - 1u] == '\r') ) )
        {
            line[--length] = '\0';
        }

        printf("> %s\n", line);

        if ( (length == 0u) ||
             (line[0] == '#') )
        {
            continue;
        }

        run_line(line);
    }

    return 0;
}
