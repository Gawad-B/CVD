# vendor/

## libgomp.so.1

- Source package: `libgomp-14.2.1-7.amzn2023.0.2.x86_64` (Amazon Linux 2023, `rpm -q libgomp`)
- File: `/usr/lib64/libgomp.so.1.0.0`, copied as `libgomp.so.1`
- sha256: `7f2ee65a05fc57cada39f3749330b056602704e2adc6259b0705737c3f85d20a`
- Why vendored: the LightGBM wheel links against the GNU OpenMP runtime, which the Vercel/Lambda
  Python 3.12 runtime (Amazon Linux 2023) does not ship, and only files in the function bundle reach
  the runtime. `ml/_native.py` loads this copy if the system lacks libgomp.
- License: GPL-3.0 with the GCC Runtime Library Exception, which permits redistribution.
