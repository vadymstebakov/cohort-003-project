# Zod to Valibot Migration

## Quick start

1. Find all Zod usage: search for `from 'zod'` or `from "zod"` imports
2. Install Valibot: add `valibot` to dependencies, remove `zod`
3. Migrate file by file using the reference below
4. Update type inference: `z.infer<>` -> `v.InferOutput<>`
5. Update parse calls: `schema.parse()` -> `v.parse(schema, data)`
6. Run type checker and tests after each file

## Workflow

- [ ] Inventory all files importing Zod
- [ ] Check for custom Zod utilities/wrappers (migrate these first)
- [ ] Migrate schemas file by file, starting with shared/base schemas
- [ ] Update all `safeParse` result access (`.data` -> `.output`, `.error` -> `.issues`)
- [ ] Update type inference (`z.infer` -> `v.InferOutput`)
- [ ] Run `tsc --noEmit` to catch type errors
- [ ] Run tests to verify behavior
- [ ] Remove `zod` from dependencies

## Core principle

Zod uses **method chaining** on schema instances. Valibot uses **standalone functions** composed via `v.pipe()`.

```ts
// Zod:  z.string().email().min(5)
// Valibot: v.pipe(v.string(), v.email(), v.minLength(5))
```

## Critical differences to remember

1. **No chaining** -- every Zod `.method()` becomes a function in `v.pipe()`
2. **Parse is a function**: `schema.parse(x)` -> `v.parse(schema, x)`
3. **SafeParse results**: `.data` -> `.output`, `.error` -> `.issues`
4. **Type inference**: `z.infer<typeof S>` -> `v.InferOutput<typeof S>`
5. **Defaults**: `.default(val)` -> `v.optional(schema, val)`
6. **Catch/fallback**: `.catch(val)` -> `v.fallback(schema, val)`
7. **Enums**: `z.enum([...])` -> `v.picklist([...])`, `z.nativeEnum(E)` -> `v.enum(E)`
8. **Discriminated unions**: `z.discriminatedUnion(k, [...])` -> `v.variant(k, [...])`
9. **Object methods**: `.passthrough()` -> `v.looseObject()`, `.strict()` -> `v.strictObject()`
10. **Pick/Omit**: `.pick({k: true})` -> `v.pick(schema, ['k'])`

## Detailed reference

See [REFERENCE.md](REFERENCE.md) for the complete API mapping.

## Migration examples

See [EXAMPLES.md](EXAMPLES.md) for real-world before/after patterns.
