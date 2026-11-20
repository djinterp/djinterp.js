/*******************************************************************************
* djinterp.js [tools]                                                    reals.c
*
*   Writes doubles as the reference writes them, for the port's real writer
* to be checked against: one line a value, its bits in hexadecimal, then its
* "%.17g", "%.15g", "%.6g" and "%.1g" texts, separated by spaces.
*     reals COUNT SEED
*   The values are the edges -- zeros, the smallest and largest, the powers
* of ten either side of where "%g" changes notation, halves that round, and
* doubles that lie exactly halfway between two texts at 17, 15 and 6
* digits, which the C library rounds to the even digit -- and then COUNT
* more whose bits a generator gives from SEED, so that a run
* is repeatable. The generator is xorshift64*, written out here so that the
* values do not depend on a library's.
*   This is the C library's printf, which is what option_env.c calls; it
* needs nothing of the reference.
*
*
* path:      /tools/reals.c
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.17
*******************************************************************************/

// std
#include <inttypes.h>  // PRIx64
#include <math.h>      // nextafter
#include <stdint.h>    // uint64_t
#include <stdio.h>     // printf
#include <stdlib.h>    // strtoull
#include <string.h>    // memcpy

static void
put(
    double _value
)
{
    uint64_t bits = 0u;

    memcpy(&bits, &_value, sizeof(bits));
    printf("%016" PRIx64 " %.17g %.15g %.6g %.1g\n", bits, _value, _value,
           _value, _value);

    return;
}

static uint64_t
next(
    uint64_t* _state
)
{
    *_state ^= *_state >> 12;
    *_state ^= *_state << 25;
    *_state ^= *_state >> 27;

    return *_state * 0x2545F4914F6CDD1Dull;
}

int main(int argc, char** argv)
{
    static const double edges[] =
    {
        0.0, -0.0, 1.0, -1.0, 0.5, 0.1, 0.2, 0.3, 1.5, 2.5, 0.25, 0.75,
        0.15, 0.25e-3, 9.5, 99.5, 0.95, 0.095, 1e21, 1e22, 1e23, 1e-5,
        1e-4, 1e-7, 123456789.0, 1234567.0, 999999.5, 9999995.0, 99999.95,
        1e15, 1e16, 1e17, 1e18, 123456789012345678.0, 5e-324,
        2.2250738585072014e-308,
        1.7976931348623157e308, 4.9406564584124654e-324, 0.3e1, 1e100,
        1e-100, 3.141592653589793, 2.718281828459045, 1.0 / 3.0, 2.0 / 3.0,
        9007199254740992.0, 9007199254740993.0, 0.000123456, 123456.0,
        1234567.5, 0.5e-4, 5e-5, 9.9999999999999995e-5, 99999999999999984.0,
        1e-6, 1.5e-6, 2.5e-5, 4.35, 0.285, 1.005, 8.345, 0.045, 1.45, 1e6,
        1e5, 999999.0, 100000.0, 1000000.0, 10000000.0, 0.0001, 0.00001,
        // exactly halfway at 17 digits (2^-25, 3 * 2^-25), at 15 (2^-22)
        // and at 6 (2^-10, 1234565)
        0x1p-25, 0x3p-25, 0x1p-22, 0x1p-10, 1234565.0
    };
    const long count = (argc > 1) ? strtol(argv[1], NULL, 10) : 0;
    uint64_t   state = (argc > 2) ? strtoull(argv[2], NULL, 10) : 1u;

    for (size_t i = 0u; i < sizeof(edges) / sizeof(edges[0]); ++i)
    {
        put(edges[i]);
        put(-edges[i]);
        put(nextafter(edges[i], 1e300));
        put(nextafter(edges[i], -1e300));
    }

    // powers of ten, and of two, across the whole range
    for (int e = -323; e <= 308; ++e)
    {
        char   text[32];
        double value;

        (void)snprintf(text, sizeof(text), "1e%d", e);
        value = strtod(text, NULL);
        put(value);
        put(value * 9.5);
        put(nextafter(value, 0.0));
    }

    for (int e = -1074; e <= 1023; e += 7)
    {
        put(ldexp(1.0, e));
        put(ldexp(3.0, e));
    }

    for (long i = 0; i < count; ++i)
    {
        const uint64_t bits  = next(&state);
        double         value = 0.0;

        // every bit pattern but the infinities and the NaNs
        if (((bits >> 52) & 0x7FFu) == 0x7FFu)
        {
            continue;
        }

        memcpy(&value, &bits, sizeof(value));
        put(value);
    }

    return 0;
}
