# swf_to_fws.py — CWS/FWS/ZWS → FWS（供 abc_dump.mjs 解析；ZWS 用 raw LZMA1）
# 用法: uv run --python 3.12 --no-project -- python swf_to_fws.py <in.swf> <out.swf>
import lzma, struct, sys, zlib

src, out = sys.argv[1:3]
b = open(src, "rb").read()
sig = b[:3]
if sig == b"FWS":
    body = b[8:]
elif sig == b"CWS":
    body = zlib.decompress(b[8:])
elif sig == b"ZWS":
    clen = struct.unpack("<I", b[8:12])[0]
    body = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "dict_size": 0x01000000, "lc": 3, "lp": 0, "pb": 2}],
    ).decompress(b[17 : 17 + clen])
else:
    raise SystemExit("unknown sig " + sig.decode("latin1"))

head = bytearray(b[:8])
head[0:3] = b"FWS"
struct.pack_into("<I", head, 4, 8 + len(body))
open(out, "wb").write(bytes(head) + body)
print(f"{sig.decode('latin1')} -> FWS body={len(body)} out={out}")
