/*******************************************************************************
* djinterp.js [tools]                                                  fixture.h
*
*   The fixture every tool here shares: a registry of frames with rows of
* every kind, the records of the djins over them, and rows no frame takes.
* rows_json.c writes it out as generated/fixture.json, which the port's tests
* declare their frames from, so that no row is typed twice; session.c runs
* console lines over it, and djinterp_fixture_main.c puts it under the
* reference's own djinterp program.
*   Built against djinterp unchanged; nothing here is part of the reference.
*
*
* path:      /tools/fixture.h
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

#ifndef DJINTERP_JS_TOOLS_FIXTURE_H
#define DJINTERP_JS_TOOLS_FIXTURE_H 1

// std
#include <stddef.h>  // size_t, NULL
// djinterp
#include "djinterp/c/option/option_env.h"           // rows, frames
#include "djinterp/c/option/option_env_registry.h"  // the registry
#include "djinterp/c/modules/interp/djin.h"         // djin records


//==============================================================================
// 1.  NAMED VALUES
//==============================================================================

// depth: an int's named values, one of them outside its range
static const struct dj_option_env_name fx_depth_names[] =
{
    { "unbounded", INT64_MAX },
    { "shallow",   2 }
};

// depth: ruled, not built
static const struct dj_option_env_name fx_depth_unbuilt[] =
{
    { "auto", -1 }
};

// style: a choice, with two names for one value
static const struct dj_option_env_name fx_style_names[] =
{
    { "plain", 0 },
    { "json",  1 },
    { "table", 2 },
    { "grid",  2 }
};

static const struct dj_option_env_name fx_style_unbuilt[] =
{
    { "xml", 3 }
};

// select: flags, with a name for nothing, one for several bits, and one
// past bit 31
static const struct dj_option_env_name fx_select_names[] =
{
    { "none",  0 },
    { "c",     1 },
    { "cpp",   2 },
    { "posix", 4 },
    { "all",   7 },
    { "wide",  (int64_t)1 << 32 }
};

static const struct dj_option_env_name fx_select_unbuilt[] =
{
    { "legacy", 8 }
};

// mode: a choice whose values leave the exact integers of a double
static const struct dj_option_env_name fx_mode_names[] =
{
    { "off",  0 },
    { "huge", INT64_MAX },
    { "low",  INT64_MIN }
};

// bits: flags with no name for nothing, and the sign bit
static const struct dj_option_env_name fx_bits_names[] =
{
    { "a",    1 },
    { "b",    2 },
    { "sign", INT64_MIN }
};


//==============================================================================
// 2.  ROWS
//==============================================================================

// the registry's root: the program-wide rows
static const struct dj_option_env_var fx_app_rows[] =
{
    D_OPTION_ENV_BOOL("color", 1, "whether output is coloured"),
    D_OPTION_ENV_INT_RANGE("width", 240, 100, 600, "an int in a range"),
    D_OPTION_ENV_REAL("ratio", 0.5, "a real"),
    D_OPTION_ENV_TEXT("title", NULL, "a text with no default"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "depth", fx_depth_names, 2u,
                     fx_depth_unbuilt, 1u, NULL, 8, 0, 64, 0.0, "max_depth",
                     NULL, "an int with named values and an alias")
};

// the djin "printer": knobs, a choice, flags, refusals, a name the root has
static const struct dj_option_env_var fx_printer_rows[] =
{
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "key_width", NULL, 0u, NULL, 0u,
                     NULL, 30, 1, 120, 0.0, NULL,
                     "D_CFG_ENV_PRINTER_KEY_WIDTH", "the width of a key"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_CHOICE, "style", fx_style_names, 4u,
                     fx_style_unbuilt, 1u, NULL, 0, INT64_MIN, INT64_MAX, 0.0,
                     "format", "D_CFG_ENV_PRINTER_STYLE",
                     "how a description is written"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_FLAGS, "select", fx_select_names, 6u,
                     fx_select_unbuilt, 1u, NULL, 3, INT64_MIN, INT64_MAX,
                     0.0, NULL, NULL, "the sections written"),
    D_OPTION_ENV_TEXT("prefix", "> ", "a text whose default needs quotes"),
    D_OPTION_ENV_ROW_REFUSING(D_OPTION_ENV_KIND_BOOL, "banner", NULL, 0u,
                              NULL, 0u, NULL, 0, INT64_MIN, INT64_MAX, 0.0,
                              NULL, NULL, "a bool the environment may not set",
                              D_OPTION_ENV_REFUSES(
                                  D_OPTION_ENV_SOURCE_ENVIRONMENT)),
    D_OPTION_ENV_INT("seed", 0, "an int of any value"),
    D_OPTION_ENV_REAL("scale", 1.0, NULL),
    D_OPTION_ENV_ROW_REFUSING(D_OPTION_ENV_KIND_TEXT, "module", NULL, 0u,
                              NULL, 0u, "builtin", 0, INT64_MIN, INT64_MAX,
                              0.0, NULL, "D_CFG_ENV_PRINTER_MODULE",
                              "a text only the program and the command line "
                              "set",
                              D_OPTION_ENV_REFUSES(
                                  D_OPTION_ENV_SOURCE_ENVIRONMENT) |
                              D_OPTION_ENV_REFUSES(
                                  D_OPTION_ENV_SOURCE_FILE)),
    D_OPTION_ENV_INT_RANGE("width", 80, 20, 200,
                           "a name the root declares too")
};

// a machine's own frame beneath "printer"
static const struct dj_option_env_var fx_printer_two_rows[] =
{
    D_OPTION_ENV_BOOL("verbose", 0, "a bool two frames down")
};

// the djin "net": values past the exact integers
static const struct dj_option_env_var fx_net_rows[] =
{
    D_OPTION_ENV_TEXT("host", "localhost", "a text with a default"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "port", NULL, 0u, NULL, 0u, NULL,
                     8080, 1, 65535, 0.0, "p", NULL, "an int with an alias"),
    D_OPTION_ENV_CHOICE("mode", fx_mode_names, 0, "a choice of 64-bit values"),
    D_OPTION_ENV_FLAGS("bits", fx_bits_names, 0, "flags with the sign bit"),
    D_OPTION_ENV_INT_RANGE("big", 0, -9007199254740992LL, 9007199254740992LL,
                           "an int one past the exact integers each way")
};

// a frame with settings and no djin record
static const struct dj_option_env_var fx_cache_rows[] =
{
    D_OPTION_ENV_INT_RANGE("size", 64, 0, 4096, NULL),
    D_OPTION_ENV_TEXT("path", NULL, "where it is kept")
};

// a root with little room, for the mechanical statuses
static const struct dj_option_env_var fx_tiny_rows[] =
{
    D_OPTION_ENV_TEXT("t", NULL, NULL),
    D_OPTION_ENV_TEXT("u", NULL, NULL),
    D_OPTION_ENV_INT("n", 0, NULL)
};

// rows a frame refuses, each for one reason, and two it takes after them
static const struct dj_option_env_var fx_bad_rows[] =
{
    D_OPTION_ENV_INT("9lives", 0, "a name that starts with a digit"),
    D_OPTION_ENV_INT("two words", 0, "a name that is not an identifier"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "aliased", NULL, 0u, NULL, 0u,
                     NULL, 0, INT64_MIN, INT64_MAX, 0.0, "not-one", NULL,
                     "an alias that is not an identifier"),
    D_OPTION_ENV_ROW(7, "kind_seven", NULL, 0u, NULL, 0u, NULL, 0, INT64_MIN,
                     INT64_MAX, 0.0, NULL, NULL, "an unknown kind"),
    D_OPTION_ENV_ROW(0, "kind_zero", NULL, 0u, NULL, 0u, NULL, 0, INT64_MIN,
                     INT64_MAX, 0.0, NULL, NULL, "no kind"),
    D_OPTION_ENV_BOOL("okay", 1, "taken"),
    D_OPTION_ENV_BOOL("okay", 0, "a name the frame has"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "other", NULL, 0u, NULL, 0u,
                     NULL, 0, INT64_MIN, INT64_MAX, 0.0, "okay", NULL,
                     "an alias the frame has as a name"),
    D_OPTION_ENV_INT_RANGE("outside", 700, 100, 600,
                           "a default outside its range"),
    D_OPTION_ENV_INT_RANGE("empty", 5, 9, 1, "an empty range"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "named_out", fx_depth_names, 2u,
                     NULL, 0u, NULL, INT64_MAX, 0, 64, 0.0, NULL, NULL,
                     "taken: a default outside its range, but named"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_CHOICE, "no_names", NULL, 0u, NULL, 0u,
                     NULL, 0, INT64_MIN, INT64_MAX, 0.0, NULL, NULL,
                     "a choice with no names"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_CHOICE, "not_named", fx_style_names,
                     4u, NULL, 0u, NULL, 9, INT64_MIN, INT64_MAX, 0.0, NULL,
                     NULL, "a choice whose default is not one of its names"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_FLAGS, "no_flags", NULL, 0u, NULL, 0u,
                     NULL, 0, INT64_MIN, INT64_MAX, 0.0, NULL, NULL,
                     "flags with no names"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_FLAGS, "stray_bit", fx_select_names,
                     6u, NULL, 0u, NULL, 8, INT64_MIN, INT64_MAX, 0.0, NULL,
                     NULL, "flags whose default has a bit no name has"),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_BOOL, "bool_two", NULL, 0u, NULL, 0u,
                     NULL, 2, INT64_MIN, INT64_MAX, 0.0, NULL, NULL,
                     "a bool whose default is neither 0 nor 1"),
    D_OPTION_ENV_ROW_REFUSING(D_OPTION_ENV_KIND_INT, "refuses_default", NULL,
                              0u, NULL, 0u, NULL, 0, INT64_MIN, INT64_MAX,
                              0.0, NULL, NULL, "refuses DEFAULT",
                              D_OPTION_ENV_REFUSES(
                                  D_OPTION_ENV_SOURCE_DEFAULT)),
    D_OPTION_ENV_ROW_REFUSING(D_OPTION_ENV_KIND_INT, "refuses_seven", NULL,
                              0u, NULL, 0u, NULL, 0, INT64_MIN, INT64_MAX,
                              0.0, NULL, NULL, "refuses a source that is none",
                              (uint32_t)1u << 7),
    D_OPTION_ENV_ROW(D_OPTION_ENV_KIND_INT, "count_no_names", NULL, 2u, NULL,
                     0u, NULL, 0, INT64_MIN, INT64_MAX, 0.0, NULL, NULL,
                     "a count of names and no names"),
    D_OPTION_ENV_INT("last", 0, "taken")
};


//==============================================================================
// 3.  FRAMES
//==============================================================================

// dj_fixture_frame
//   struct: one frame of the fixture: its name, its parent's name or NULL,
// whether the registry lists it as a djin, its rows and scopes, and its
// room.
struct dj_fixture_frame
{
    const char*                     name;
    const char*                     parent;
    int                             is_djin;
    const struct dj_option_env_var* rows;
    uint32_t                        row_count;
    const char* const*              scopes;
    uint32_t                        scope_count;
    uint32_t                        bindings;
    uint32_t                        vars;
    uint32_t                        text;
};

#define FX_COUNT(a)  ((uint32_t)(sizeof(a) / sizeof((a)[0])))

static const char* const fx_app_scopes[]         = { "debug" };
static const char* const fx_printer_scopes[]     = { "cpp_features",
                                                      "summary" };
static const char* const fx_printer_two_scopes[] = { "local" };

// the first is the registry's root; its room is the registry's own
// (cfg_option_env.h), given here so the port's fixture has the same
static const struct dj_fixture_frame fx_frames[] =
{
    { "app", NULL, 0, fx_app_rows, FX_COUNT(fx_app_rows),
      fx_app_scopes, 1u,
      D_CFG_OPTION_ENV_REGISTRY_BINDINGS,
      D_CFG_OPTION_ENV_REGISTRY_VARIABLES,
      D_CFG_OPTION_ENV_REGISTRY_TEXT },
    { "printer", "app", 1, fx_printer_rows, FX_COUNT(fx_printer_rows),
      fx_printer_scopes, 2u, 64u, 16u, 512u },
    { "net", "app", 1, fx_net_rows, FX_COUNT(fx_net_rows),
      NULL, 0u, 32u, 8u, 256u },
    { "cache", "app", 1, fx_cache_rows, FX_COUNT(fx_cache_rows),
      NULL, 0u, 16u, 4u, 128u },
    { "printer_two", "printer", 0, fx_printer_two_rows,
      FX_COUNT(fx_printer_two_rows), fx_printer_two_scopes, 1u,
      32u, 4u, 128u },
    { "tiny", NULL, 0, fx_tiny_rows, FX_COUNT(fx_tiny_rows),
      NULL, 0u, 2u, 3u, 16u }
};

#define FX_FRAMES  FX_COUNT(fx_frames)


//==============================================================================
// 4.  DJIN RECORDS
//==============================================================================

// dj_fixture_djin
//   struct: one record of the fixture: the key a session names it by, the
// record's own members, and the frame its settings are, by name, or NULL.
struct dj_fixture_djin
{
    const char*                   key;
    const char*                   name;
    const char*                   version;
    const char*                   summary;
    const struct dj_djin_command* commands;
    size_t                        command_count;
    const char*                   settings;
    uint32_t                      abi;
};

static const struct dj_djin_command fx_printer_commands[] =
{
    D_DJIN_COMMAND("run", "print a description", NULL, NULL),
    D_DJIN_COMMAND("check-all", "check every description", NULL, NULL)
};

static const struct dj_djin_command fx_twice_commands[] =
{
    D_DJIN_COMMAND("go", "once", NULL, NULL),
    D_DJIN_COMMAND("go", "twice", NULL, NULL)
};

static const struct dj_djin_command fx_shout_commands[] =
{
    D_DJIN_COMMAND("Go", "an upper-case verb", NULL, NULL)
};

// the names the session's program keeps for itself
static const char* const fx_reserved[] =
{
    "list", "describe", "get", "set", "help", "completion", NULL
};

static const struct dj_fixture_djin fx_djins[] =
{
    { "printer", "printer", "0.9.0", "prints descriptions",
      fx_printer_commands, 2u, "printer", D_DJIN_ABI },
    { "net", "net", "1.2", "talks to other machines", NULL, 0u, "net",
      D_DJIN_ABI },
    { "plain", "plain", "3", "a djin with no settings and no commands", NULL,
      0u, NULL, D_DJIN_ABI },
    { "printer_again", "printer", "0.9.1", "a name a djin has", NULL, 0u,
      NULL, D_DJIN_ABI },
    { "reserved", "list", "1", "one of the program's own names", NULL, 0u,
      NULL, D_DJIN_ABI },
    { "upper", "Printer", "1", "a name that is not a lowercase word", NULL,
      0u, NULL, D_DJIN_ABI },
    { "no_version", "nover", "", "an empty version", NULL, 0u, NULL,
      D_DJIN_ABI },
    { "two_lines", "lines", "1", "a summary\nof two lines", NULL, 0u, NULL,
      D_DJIN_ABI },
    { "twice", "twice", "1", "a command named twice", fx_twice_commands, 2u,
      NULL, D_DJIN_ABI },
    { "shout", "shout", "1", "a command that is not a lowercase word",
      fx_shout_commands, 1u, NULL, D_DJIN_ABI },
    { "other_abi", "abi", "1", "another ABI", NULL, 0u, NULL,
      D_DJIN_ABI + 1u },
    { "wrong_frame", "wrong", "1", "settings named as another djin", NULL,
      0u, "net", D_DJIN_ABI },
    { "cache_named", "cache", "2.0", "a record for a frame already listed",
      NULL, 0u, "cache", D_DJIN_ABI }
};

#define FX_DJINS  FX_COUNT(fx_djins)


#endif  // DJINTERP_JS_TOOLS_FIXTURE_H
