# Zod to Valibot: Complete API Reference

## Import Pattern

```ts
// Zod
import { z } from 'zod';

// Valibot
import * as v from 'valibot';
```

---

## Parsing & Validation

| Zod | Valibot |
|-----|---------|
| `schema.parse(value)` | `v.parse(schema, value)` |
| `schema.safeParse(value)` | `v.safeParse(schema, value)` |
| `schema.parseAsync(value)` | `v.parseAsync(schema, value)` |
| `schema.safeParseAsync(value)` | `v.safeParseAsync(schema, value)` |

### SafeParse result shape

```ts
// Zod: result.success ? result.data : result.error
// Valibot: result.success ? result.output : result.issues
```

### Parse options (Valibot-only)

```ts
v.parse(schema, data, { abortEarly: true });
v.parse(schema, data, { abortPipeEarly: true });
```

### Reusable parsers (Valibot-only)

```ts
const myParser = v.parser(schema);       // throws on failure
const mySafeParser = v.safeParser(schema); // returns result object
```

---

## Type Inference

| Zod | Valibot |
|-----|---------|
| `z.infer<typeof schema>` | `v.InferOutput<typeof schema>` |
| `z.input<typeof schema>` | `v.InferInput<typeof schema>` |
| `z.output<typeof schema>` | `v.InferOutput<typeof schema>` |

---

## Primitive Schemas

| Zod | Valibot |
|-----|---------|
| `z.string()` | `v.string()` |
| `z.number()` | `v.number()` |
| `z.bigint()` | `v.bigint()` |
| `z.boolean()` | `v.boolean()` |
| `z.date()` | `v.date()` |
| `z.symbol()` | `v.symbol()` |
| `z.undefined()` | `v.undefined()` |
| `z.null()` | `v.null()` |
| `z.void()` | `v.void()` |
| `z.any()` | `v.any()` |
| `z.unknown()` | `v.unknown()` |
| `z.never()` | `v.never()` |
| `z.nan()` | `v.nan()` |
| `z.literal('foo')` | `v.literal('foo')` |
| `z.instanceof(Class)` | `v.instance(Class)` |

---

## String Validations

All string validations go inside `v.pipe()`:

| Zod | Valibot |
|-----|---------|
| `.min(n)` | `v.minLength(n)` |
| `.max(n)` | `v.maxLength(n)` |
| `.length(n)` | `v.length(n)` |
| `.email()` | `v.email()` |
| `.url()` | `v.url()` |
| `.uuid()` | `v.uuid()` |
| `.cuid2()` | `v.cuid2()` |
| `.ulid()` | `v.ulid()` |
| `.nanoid()` | `v.nanoid()` |
| `.regex(re)` | `v.regex(re)` |
| `.startsWith(s)` | `v.startsWith(s)` |
| `.endsWith(s)` | `v.endsWith(s)` |
| `.includes(s)` | `v.includes(s)` |
| `.trim()` | `v.trim()` |
| `.toLowerCase()` | `v.toLowerCase()` |
| `.toUpperCase()` | `v.toUpperCase()` |
| `.datetime()` | `v.isoDateTime()` |
| `.ip()` | `v.ip()` |
| `.emoji()` | `v.emoji()` |
| `.base64()` | `v.base64()` |
| `.min(1)` (nonempty) | `v.nonEmpty()` |

```ts
// Zod
z.string().trim().email().min(5, "Too short")

// Valibot
v.pipe(v.string(), v.trim(), v.email(), v.minLength(5, "Too short"))
```

---

## Number Validations

All number validations go inside `v.pipe()`:

| Zod | Valibot |
|-----|---------|
| `.gt(n)` | `v.gtValue(n)` |
| `.gte(n)` / `.min(n)` | `v.minValue(n)` |
| `.lt(n)` | `v.ltValue(n)` |
| `.lte(n)` / `.max(n)` | `v.maxValue(n)` |
| `.int()` | `v.integer()` |
| `.positive()` | `v.gtValue(0)` |
| `.negative()` | `v.ltValue(0)` |
| `.nonnegative()` | `v.minValue(0)` |
| `.nonpositive()` | `v.maxValue(0)` |
| `.multipleOf(n)` | `v.multipleOf(n)` |
| `.finite()` | `v.finite()` |
| `.safe()` | `v.safeInteger()` |

---

## Date Validations

| Zod | Valibot |
|-----|---------|
| `.min(date)` | `v.minValue(date)` inside `v.pipe()` |
| `.max(date)` | `v.maxValue(date)` inside `v.pipe()` |

---

## Object Schemas

| Zod | Valibot |
|-----|---------|
| `z.object({...})` | `v.object({...})` |
| `.passthrough()` | `v.looseObject({...})` |
| `.strict()` | `v.strictObject({...})` |
| `.strip()` | `v.object({...})` (default) |
| `.catchall(schema)` | `v.objectWithRest({...}, schema)` |
| `.shape` | `.entries` |
| `.keyof()` | `v.keyof(schema)` |

### Object manipulation

| Zod | Valibot |
|-----|---------|
| `.extend({...})` | `v.object({...schema.entries, ...extra})` |
| `.merge(other)` | `v.object({...a.entries, ...b.entries})` |
| `.pick({k: true})` | `v.pick(schema, ['k'])` |
| `.omit({k: true})` | `v.omit(schema, ['k'])` |
| `.partial()` | `v.partial(schema)` |
| `.partial({k: true})` | `v.partial(schema, ['k'])` |
| `.required()` | `v.required(schema)` |
| `.required({k: true})` | `v.required(schema, ['k'])` |

```ts
// Zod
const Extended = UserSchema.extend({ role: z.string() });
const Picked = UserSchema.pick({ name: true, email: true });
const Partial = UserSchema.partial();

// Valibot
const Extended = v.object({ ...UserSchema.entries, role: v.string() });
const Picked = v.pick(UserSchema, ['name', 'email']);
const Partial = v.partial(UserSchema);
```

---

## Array Schemas

| Zod | Valibot |
|-----|---------|
| `z.array(schema)` | `v.array(schema)` |
| `.min(n)` | `v.minLength(n)` in `v.pipe()` |
| `.max(n)` | `v.maxLength(n)` in `v.pipe()` |
| `.length(n)` | `v.length(n)` in `v.pipe()` |
| `.nonempty()` | `v.nonEmpty()` in `v.pipe()` |
| `.element` | `.item` |

---

## Tuple Schemas

| Zod | Valibot |
|-----|---------|
| `z.tuple([a, b])` | `v.tuple([a, b])` |
| `z.tuple([a, b], rest)` | `v.tupleWithRest([a, b], rest)` |

---

## Union, Intersection, Variant

| Zod | Valibot |
|-----|---------|
| `z.union([a, b])` | `v.union([a, b])` |
| `schema.or(other)` | `v.union([schema, other])` |
| `z.discriminatedUnion('key', [...])` | `v.variant('key', [...])` |
| `z.intersection(a, b)` | `v.intersect([a, b])` |
| `schema.and(other)` | `v.intersect([schema, other])` |

```ts
// Zod
z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), value: z.string() }),
  z.object({ type: z.literal('b'), count: z.number() }),
])

// Valibot
v.variant('type', [
  v.object({ type: v.literal('a'), value: v.string() }),
  v.object({ type: v.literal('b'), count: v.number() }),
])
```

---

## Record, Map, Set

| Zod | Valibot |
|-----|---------|
| `z.record(keySchema, valSchema)` | `v.record(keySchema, valSchema)` |
| `z.map(keySchema, valSchema)` | `v.map(keySchema, valSchema)` |
| `z.set(schema)` | `v.set(schema)` |
| `z.set().min(n)` | `v.pipe(v.set(...), v.minSize(n))` |
| `z.set().max(n)` | `v.pipe(v.set(...), v.maxSize(n))` |
| `z.set().size(n)` | `v.pipe(v.set(...), v.size(n))` |

---

## Enum & NativeEnum

| Zod | Valibot |
|-----|---------|
| `z.enum(['a', 'b', 'c'])` | `v.picklist(['a', 'b', 'c'])` |
| `z.nativeEnum(TSEnum)` | `v.enum(TSEnum)` |

```ts
// Zod
const Status = z.enum(['active', 'inactive']);
enum Role { Admin, User }
const RoleSchema = z.nativeEnum(Role);

// Valibot
const Status = v.picklist(['active', 'inactive']);
enum Role { Admin, User }
const RoleSchema = v.enum(Role);
```

---

## Optional, Nullable, Nullish, Default, Fallback

| Zod | Valibot |
|-----|---------|
| `schema.optional()` | `v.optional(schema)` |
| `schema.nullable()` | `v.nullable(schema)` |
| `schema.nullish()` | `v.nullish(schema)` |
| `schema.default(val)` | `v.optional(schema, val)` |
| `schema.default(() => val)` | `v.optional(schema, () => val)` |
| `schema.catch(val)` | `v.fallback(schema, val)` |
| `schema.catch(() => val)` | `v.fallback(schema, () => val)` |

Valibot extras:
- `v.nonOptional(schema)` -- unwrap optional
- `v.nonNullable(schema)` -- unwrap nullable
- `v.nonNullish(schema)` -- unwrap nullish
- `v.exactOptional(schema)` -- key can be absent but `undefined` is NOT accepted

---

## Refinements & Custom Validations

| Zod | Valibot |
|-----|---------|
| `.refine(fn, msg)` | `v.check(fn, msg)` in `v.pipe()` |
| `.refine(fn, {path})` | `v.forward(v.check(fn, msg), ['path'])` in `v.pipe()` |
| `.superRefine((val, ctx) => {...})` | `v.rawCheck(({dataset, addIssue}) => {...})` in `v.pipe()` |
| `z.custom<T>(fn)` | `v.custom<T>(fn)` |

```ts
// Zod: password confirmation
z.object({
  password: z.string(),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})

// Valibot
v.pipe(
  v.object({ password: v.string(), confirm: v.string() }),
  v.forward(
    v.check(d => d.password === d.confirm, "Passwords don't match"),
    ['confirm']
  )
)
```

### superRefine -> rawCheck

```ts
// Zod
schema.superRefine((val, ctx) => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Error', path: ['field'] });
})

// Valibot
v.pipe(schema, v.rawCheck(({ dataset, addIssue }) => {
  if (dataset.typed) {
    addIssue({
      message: 'Error',
      path: [{
        type: 'object', origin: 'value',
        input: dataset.value, key: 'field',
        value: dataset.value.field
      }]
    });
  }
}))
```

---

## Transforms

| Zod | Valibot |
|-----|---------|
| `.transform(fn)` | `v.transform(fn)` in `v.pipe()` |
| `z.preprocess(fn, schema)` | `v.pipe(v.unknown(), v.transform(fn), schema)` |
| `.superRefine()` + transform | `v.rawTransform(({dataset, addIssue, NEVER}) => {...})` |

```ts
// Zod
z.string().transform(val => val.length)
// Valibot
v.pipe(v.string(), v.transform(val => val.length))

// Zod preprocess
z.preprocess(val => String(val), z.string())
// Valibot
v.pipe(v.unknown(), v.transform(val => String(val)), v.string())
```

---

## Coercion

| Zod | Valibot |
|-----|---------|
| `z.coerce.string()` | `v.pipe(v.unknown(), v.transform(String))` |
| `z.coerce.number()` | `v.pipe(v.unknown(), v.transform(Number))` |
| `z.coerce.boolean()` | `v.pipe(v.unknown(), v.transform(Boolean))` |
| `z.coerce.bigint()` | `v.pipe(v.unknown(), v.transform(BigInt))` |
| `z.coerce.date()` | `v.pipe(v.unknown(), v.transform(v => new Date(v)))` |

For number coercion with validation:

```ts
// Zod
z.coerce.number().int().positive()

// Valibot
v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer(), v.gtValue(0))
```

---

## Brand

| Zod | Valibot |
|-----|---------|
| `schema.brand<'Name'>()` | `v.pipe(schema, v.brand('Name'))` |

---

## Readonly

| Zod | Valibot |
|-----|---------|
| `schema.readonly()` | `v.pipe(schema, v.readonly())` |

---

## Lazy (Recursive Schemas)

| Zod | Valibot |
|-----|---------|
| `z.lazy(() => schema)` | `v.lazy(() => schema)` |

Type annotation changes:

```ts
// Zod
const Schema: z.ZodType<MyType> = z.lazy(() => ...)

// Valibot
const Schema: v.GenericSchema<MyType> = v.lazy(() => ...)
```

---

## Metadata / Description

| Zod | Valibot |
|-----|---------|
| `schema.describe('...')` | `v.pipe(schema, v.description('...'))` |

---

## Async Schemas

For async operations, use `*Async` variants:

| Zod | Valibot |
|-----|---------|
| `schema.parseAsync(val)` | `v.parseAsync(schema, val)` |
| `schema.safeParseAsync(val)` | `v.safeParseAsync(schema, val)` |
| `.refine(asyncFn)` | `v.checkAsync(asyncFn)` in `v.pipeAsync()` |
| `.transform(asyncFn)` | `v.transformAsync(asyncFn)` in `v.pipeAsync()` |

When using any async action, the pipe must also be async:

```ts
v.pipeAsync(v.string(), v.checkAsync(async (email) => await isUnique(email), 'Taken'))
```

---

## Error Handling

| Zod | Valibot |
|-----|---------|
| `ZodError` | `ValiError` |
| `error.issues` | `error.issues` |
| `error.format()` | `v.flatten(issues)` |
| `error.flatten()` | `v.flatten(issues)` |

```ts
// Zod
try { schema.parse(data); }
catch (e) { if (e instanceof z.ZodError) e.issues; }

// Valibot
try { v.parse(schema, data); }
catch (e) { if (v.isValiError(e)) e.issues; }
```

### Custom error messages

```ts
// Zod: message property in options object
z.string({ invalid_type_error: 'Not a string' }).min(5, { message: 'Too short' })

// Valibot: simple string argument
v.pipe(v.string('Not a string'), v.minLength(5, 'Too short'))
```

---

## Codemod (automated migration)

Valibot provides an official codemod for mechanical conversion:

```bash
# Dry run (preview changes)
npx @valibot/zod-to-valibot "src/**/*" --dry

# Apply
npx @valibot/zod-to-valibot "src/**/*"
```

**Important**: The codemod is in beta. Always review output manually and run type checking + tests after.
