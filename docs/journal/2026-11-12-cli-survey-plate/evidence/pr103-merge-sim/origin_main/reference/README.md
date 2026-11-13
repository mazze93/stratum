# Reference implementation (semantics oracle)

`tessera_projection.py` is the executable reference for the Event Epistemic
Contract — v3, epoch-pure, replay-proven, 16/16 invariants. It is **not** the
production runtime; `core/` (TypeScript) is. The Python stays authoritative for
*semantics*: any divergence between the two implementations is a bug in the
port, decided by this file.

The cross-validation test in `core/test/` feeds both implementations the same
persisted log and asserts identical authoritative fingerprints.

Run: `python3 test_tessera_projection.py` (stdlib only, 3.9+).
