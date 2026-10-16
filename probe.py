#!/usr/bin/env python3
"""probe.py: decode one Crazy Taxi character's model parts from files extracted off your own disc.

    python3 probe.py <folder with 1ST_READ.BIN and POLDC0.BIN> [character, hex, default 3B]

Prints the character's 16 part pointers (mptbl_All, 0x0C1331B0 -> an array of 16 pointers into POLDC0.BIN,
loaded at 0x0C390000) and, for each part, its records. A part is a 24-byte header (two counts and a
bounding sphere), then mesh records, each a 0x50-byte header (the control word 0x8000002C, ISP, TSP, a
texture number at +0x20, the length of the strip data at +0x4C) followed by that data. The vertex layout
inside the data is not decoded yet.
"""
import struct
import sys

folder = sys.argv[1] if len(sys.argv) > 1 else '.'
ch = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x3B
exe = open(folder + '/1ST_READ.BIN', 'rb').read()
pol = open(folder + '/POLDC0.BIN', 'rb').read()
EXE_BASE, POL_BASE, TABLE = 0x0C010000, 0x0C390000, 0x0C1331B0
E = lambda a: struct.unpack_from('<I', exe, a - EXE_BASE)[0]
P = lambda o: struct.unpack_from('<I', pol, o)[0]
F = lambda o: struct.unpack_from('<f', pol, o)[0]

arr = E(TABLE + 4 * ch)
parts = [E(arr + 4 * i) for i in range(16)]
print('character %#x, parts at %#x' % (ch, arr))
for i, p in enumerate(parts):
    if not p:
        print('part %2d: none' % i)
        continue
    o = p - POL_BASE
    print('part %2d: POLDC0 +%#x, counts %d %d, sphere %s' % (i, o, P(o), P(o + 4), [round(F(o + 8 + 4 * k), 2) for k in range(4)]))
    m = o + 24
    while P(m):
        print('    record +%#x: control %08x, TSP %08x, texture %d, %d bytes of strip data'
              % (m - o, P(m), P(m + 8), struct.unpack_from('<i', pol, m + 0x20)[0], P(m + 0x4C)))
        m += P(m + 0x4C) + 0x50
