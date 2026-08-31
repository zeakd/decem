# Values, in and out

The arithmetic is the subject of [`invariants.md`](invariants.md). This page is about the
two edges: how a number becomes a value, and what happens when a value leaves.

## In

```ts
dec`19.99`                    // written here in the source
dec(row.price)                // a string or a bigint that arrived at run time
fromInt(n)                    // a count or an index; raises unless it is a safe integer
fromNumber(v, mode)           // a float64, with the assumption said out loud
tryDec(input)                 // the same parse, answering null instead of raising
```

`dec` is one name because it is one operation. The backticks and the parentheses already
say whether the text was written here or arrived, so a second name would only spell the
syntax out again. `fromInt` and `fromNumber` keep the older prefix, and it now marks
something: both of them cross from one of JavaScript's own number types, which is the
boundary where precision is at stake.

`dec` rejects interpolation. Allowing `` dec`${a}` `` would open a side door for a number
to arrive as text, and combining values is what the arithmetic is for.

`tryDec` exists because a field a person typed fails as a matter of course, not as an
exception, and making every form use a try block turns an error into control flow.
Everything else still raises.

It answers `null` for a `number` too. The type refuses one, so the only way to arrive with
a float here is through `unknown` or a cast, and that is exactly what a JSON body is. Both
`"12,50"` and `12.5` come back `null`, which is enough to reject the field and not enough
to say why. Narrow to `string` first if the two are different answers to your client, and
they usually are: one of them typed the wrong thing and the other sent a number where the
contract says text.

In a file that is mostly constants, rename at the import:

```ts
import { dec as d } from "decem";

const VAT = d`0.1`;
```

## Why `dec` refuses a number

By the time `0.1` reaches any function it is already
`0.1000000000000000055511151231257827`, and a constructor cannot tell which of the two you
meant. Other libraries take the shortest decimal that round-trips. Usually right, and
silent when it is not.

```ts
fromNumber(0.1, "shortest")   // 0.1, what JavaScript prints
fromNumber(0.1, "exact")      // 0.1000000000000000055511151231257827021181583404541015625
```

`shortest` is the same answer other libraries give.

What changes is where the assumption is written: at the call site, by you, instead of
inside a constructor that never tells you it chose. The mode has no default, for the same
reason an approximate operation has none.

`shortest` is what application code usually wants. `exact` is a diagnostic: measuring the
error of a float computation, checking a formatter, or asking what the machine held.

## Out

```ts
`${price}`                    // "19.99"
String(price)                 // "19.99"
toString(price)               // "19.99"
JSON.stringify({ price })     // {"price":"19.99"}
[price].join()                // "19.99"
```

Anything that asks for text gets the value. Anything that asks for a number raises and
names the function to use, because converting is the loss this library exists to prevent:

```ts
price * 2                     // TypeError: use mul
price < other                 // TypeError: use lt
Number(price)                 // TypeError: use toNumber, which raises before it rounds
```

### Every one of those is `to-scientific-string`

Including `toJSON`, which is where it bites. `toString` follows the specification, so a
value whose adjusted exponent is far enough from zero comes out as `1E+3`, and arithmetic
does not launder that away: exponents are carried through, so `mul(dec("1e3"), fromInt(3))`
is `3E+3` and `JSON.stringify` puts that in the body. The client parses it as text and the
number is now a string nobody meant.

Nothing in the value is wrong. The spelling is, for that destination.

```ts
toPlainString(price)          // "19.99", and never an exponent for any value
```

A wire, a `NUMERIC` parameter, a CSV and a receipt all want the plain form. `toPlainString`
rounds nothing and keeps the scale, so it is the same value `toString` gives, written the
other way. Use it wherever a `Dec` leaves the process, and hand `JSON.stringify` a string
you produced instead of the value itself. Nothing else in the list above is safe for a
destination that parses what it receives.

### The one that is neither

`+` asks for neither. It cannot say whether the other side is text until both sides have
answered, so `price + 1` and `"log " + price` arrive identically.

Raising would end a log line inside code the caller does not own. Answering with the value
would make `price + 1` into `"19.991"`, a wrong number wearing the shape of a right one.
It answers inside a marker instead:

```ts
"price=" + price              // "price=[decimal 19.99]"
price + 1                     // "[decimal 19.99]1", not "19.991"
```

The log still carries the number, and the mistake cannot pass for arithmetic. `[object
Object]` manages the second half of that and throws away the first, which is the whole
reason the value stays inside a marker instead of disappearing behind a type name.

#### Why not raise here, when the language does

Temporal raises. `"" + date` is a `TypeError` and `Symbol` behaves the same way, which is
the newest and most carefully argued precedent for a value type refusing implicit coercion,
and this deliberately does not follow it.

The reason is what happened next. Temporal issue 1462 reports the cost in the wild: a
value passed to code you do not control, a component prop, an older library. Worse, a
build step can turn a template literal into concatenation, so `${price}` becomes
`"" + price` and code that ran in development raises in production. TypeScript's own
output is safe, since it emits `"price=".concat(price)` and `concat` asks for a string,
but a loose template-literal transform emits `+`.

A raise there ends a request over a diagnostic line. A marker prints something a person
can read and fix. Money is logged more often than a date is, and passed to more code the
caller did not write, so the balance lands differently here than it did for Temporal.

Two other things separate the cases. Temporal refuses through `valueOf`, and `valueOf` is
not told
what the caller wants, so refusing `date1 > date2` and refusing `"" + date` are one act
or two; `Symbol.toPrimitive` receives the hint and can hold them apart. And a
date does not have this problem to begin with: `"2022-01-01" + 1` is obviously wrong,
while `"19.99" + 1` is `"19.991"`, which is not. So the marker earns something only where
the text of a value looks like a number, and that is close to decimals alone.

The nearest peer has already been down this road. `big.js` has a `strict` mode whose
`valueOf` throws. That is Temporal's design in this exact domain: `` `${a}` `` still
works, `"x=" + a` and `a < b` raise. Its author built it and left it **off by default**,
which reads as the same judgement reached here, taken one step less far. Where `strict`
also refuses a `number` in the constructor, that is on by default here.

None of that makes the marker right. It has no precedent, and the reason may be that it is
a bad idea and not an unmet need. The reasoning is written down here, so whoever revisits
it starts from the argument and not from the beginning.

What is kept from that precedent is the part with no such cost: the number hint raises, so
`price < other` cannot silently compare as text. That one matters. In `decimal.js` and
`big.js` today, `new Decimal(9) < new Decimal(10)` is `false`.

### What the type checker already catches

TypeScript rejects `price + 1`, `price * 2`, `price == "19.99"` and an assignment to a
number before the program runs. Two shapes get past it:

```ts
price < other                 // raises at run time; use lt
if (price)                    // always true, even for zero; use isZero
```

The second cannot raise at all, because a truth test never asks an object to convert.

## Crossing a boundary

Anything that copies the fields and drops the prototype gives back a plain object with the
value and without the spelling: `{...price}`, `Object.assign({}, price)` and
`structuredClone` all interpolate as `[object Object]`.

Moving the hook onto each value would rescue the spread and still not the clone, since a
clone ignores symbol keys whatever they are, and it makes creating a value four times
slower. A library that makes millions of them should not take that trade for one of three
paths. **Cross a boundary as a string:**

```ts
const wire = toString(price);   // or JSON.stringify, which calls toJSON
const back = dec(wire);
```

Only values made here count as values. An object with the right fields is not one, which
the type rejects it before the arithmetic finds out, and `isDec` answers the
same question at run time.
