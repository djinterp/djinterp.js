/*******************************************************************************
* djinterp.js [tools]                                                 json_out.h
*
*   JSON written to the output, for the tools that write generated data: a
* string, a row's named values, and every member of a struct
* dj_option_env_var in the struct's own order. A 64-bit integer is written
* as a decimal string, since a JSON number is a double; a real as its
* "%.17g" text beside its bits in hexadecimal.
*
*
* path:      /tools/json_out.h
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

#ifndef DJINTERP_JS_TOOLS_JSON_OUT_H
#define DJINTERP_JS_TOOLS_JSON_OUT_H 1

// std
#include <inttypes.h>  // PRId64, PRIx64
#include <stdio.h>     // printf, fputs, putchar
#include <string.h>    // memcpy
// djinterp
#include "djinterp/c/option/option_env.h"  // struct dj_option_env_var

/*
json_string
  A text as a JSON string, or null.
*/
static void
json_string(
    const char* _text
)
{
    if (_text == NULL)
    {
        fputs("null", stdout);

        return;
    }

    putchar('"');

    for (; *_text != '\0'; ++_text)
    {
        const unsigned char c = (unsigned char)*_text;

        if ( (c == '"') ||
             (c == '\\') )
        {
            printf("\\%c", c);
        }
        else if (c < 0x20u)
        {
            printf("\\u%04x", (unsigned)c);
        }
        else
        {
            putchar((int)c);
        }
    }

    putchar('"');

    return;
}

/*
json_names
  An array of struct dj_option_env_name, or null where the pointer is.
*/
static void
json_names(
    const struct dj_option_env_name* _names,
    uint32_t                         _count
)
{
    if (_names == NULL)
    {
        fputs("null", stdout);

        return;
    }

    putchar('[');

    for (uint32_t i = 0u; i < _count; ++i)
    {
        printf("%s{\"name\": ", (i != 0u) ? ", " : "");
        json_string(_names[i].name);
        printf(", \"value\": \"%" PRId64 "\"}", _names[i].value);
    }

    putchar(']');

    return;
}

/*
json_row
  Every member of a row, in the struct's order.
*/
static void
json_row(
    const struct dj_option_env_var* _row
)
{
    uint64_t bits = 0u;

    memcpy(&bits, &_row->real, sizeof(bits));

    fputs("{\"name\": ", stdout);
    json_string(_row->name);
    fputs(", \"help\": ", stdout);
    json_string(_row->help);
    fputs(", \"alias\": ", stdout);
    json_string(_row->alias);
    fputs(", \"knob\": ", stdout);
    json_string(_row->knob);
    fputs(",\n         \"names\": ", stdout);
    json_names(_row->names, _row->name_count);
    fputs(",\n         \"unbuilt\": ", stdout);
    json_names(_row->unbuilt, _row->unbuilt_count);
    fputs(",\n         \"text\": ", stdout);
    json_string(_row->text);
    printf(", \"integer\": \"%" PRId64 "\", \"minimum\": \"%" PRId64
           "\", \"maximum\": \"%" PRId64 "\",\n         \"real\": \"%.17g\", "
           "\"real_bits\": \"%016" PRIx64 "\", \"name_count\": %u, "
           "\"unbuilt_count\": %u,\n         \"kind\": %d, \"refused\": %u}",
           _row->integer, _row->minimum, _row->maximum, _row->real, bits,
           (unsigned)_row->name_count, (unsigned)_row->unbuilt_count,
           (int)_row->kind, (unsigned)_row->refused);

    return;
}

/*
json_rows
  A table of rows.
*/
static void
json_rows(
    const struct dj_option_env_var* _rows,
    uint32_t                        _count
)
{
    fputs("[\n", stdout);

    for (uint32_t i = 0u; i < _count; ++i)
    {
        fputs("        ", stdout);
        json_row(&_rows[i]);
        fputs((i + 1u < _count) ? ",\n" : "\n", stdout);
    }

    fputs("      ]", stdout);

    return;
}


#endif  // DJINTERP_JS_TOOLS_JSON_OUT_H
