# Security

This is a pure-computation library: no network, no filesystem, no dynamic code, and no
runtime dependencies. The realistic risk surface is denial of service through resource
exhaustion, and that is bounded by contract.

## Resource limits

Both limits are enforced by decem before the engine reaches its own ceiling, so failures
are consistent exceptions rather than out-of-memory crashes:

- `DigitOverflow`, when the mantissa would exceed the runtime's `BigInt` capacity.
- `ExponentOverflow`, when the exponent would leave the safe-integer range.

Untrusted input still deserves an explicit precision bound. A caller who passes an
attacker-controlled `digits` value is asking for however much work that implies;
`IndeterminateRounding` bounds the retry loop, but the requested precision itself is the
caller's choice.

## Reporting

Open an issue for anything that produces a wrong value. That is a correctness defect and
is treated as one. For a genuine vulnerability, please report privately through GitHub's
security advisory form rather than a public issue.
