# Zod to Valibot: Migration Examples

Real-world before/after patterns for common migration scenarios.

---

## 1. Basic form validation schema

```ts
// BEFORE (Zod)
import { z } from 'zod';

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(8, "Must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

type SignupData = z.infer<typeof SignupSchema>;

// AFTER (Valibot)
import * as v from 'valibot';

const SignupSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email("Invalid email")),
  password: v.pipe(v.string(), v.minLength(8, "Must be at least 8 characters")),
  name: v.pipe(v.string(), v.minLength(1, "Name is required")),
});

type SignupData = v.InferOutput<typeof SignupSchema>;
```

---

## 2. Discriminated union for form actions (intent pattern)

```ts
// BEFORE (Zod)
import { z } from 'zod';

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    title: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    intent: z.literal("update"),
    id: z.coerce.number().int(),
    title: z.string().min(1),
  }),
  z.object({
    intent: z.literal("delete"),
    id: z.coerce.number().int(),
  }),
]);

// AFTER (Valibot)
import * as v from 'valibot';

const ActionSchema = v.variant("intent", [
  v.object({
    intent: v.literal("create"),
    title: v.pipe(v.string(), v.minLength(1)),
    description: v.optional(v.string()),
  }),
  v.object({
    intent: v.literal("update"),
    id: v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer()),
    title: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    intent: v.literal("delete"),
    id: v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer()),
  }),
]);
```

---

## 3. Native enum usage

```ts
// BEFORE (Zod)
import { z } from 'zod';
import { UserRole, CourseStatus } from './db-enums';

const UserSchema = z.object({
  role: z.nativeEnum(UserRole),
  courseStatus: z.nativeEnum(CourseStatus),
  name: z.string(),
});

// AFTER (Valibot)
import * as v from 'valibot';
import { UserRole, CourseStatus } from './db-enums';

const UserSchema = v.object({
  role: v.enum(UserRole),
  courseStatus: v.enum(CourseStatus),
  name: v.string(),
});
```

---

## 4. String enum (picklist)

```ts
// BEFORE (Zod)
const StatusSchema = z.enum(['draft', 'published', 'archived']);
type Status = z.infer<typeof StatusSchema>;

// AFTER (Valibot)
const StatusSchema = v.picklist(['draft', 'published', 'archived']);
type Status = v.InferOutput<typeof StatusSchema>;
```

---

## 5. Coercion from form data

```ts
// BEFORE (Zod)
const ParamsSchema = z.object({
  page: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(100),
  search: z.string().optional(),
});

// AFTER (Valibot)
const ParamsSchema = v.object({
  page: v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer(), v.gtValue(0)),
  limit: v.pipe(v.unknown(), v.transform(Number), v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  search: v.optional(v.string()),
});
```

---

## 6. Nested arrays with validations

```ts
// BEFORE (Zod)
const QuizSchema = z.object({
  title: z.string().min(1),
  questions: z.array(
    z.object({
      text: z.string().min(1),
      type: z.nativeEnum(QuestionType),
      options: z.array(
        z.object({
          text: z.string().min(1),
          isCorrect: z.boolean(),
        })
      ).min(2, "At least 2 options"),
    })
  ).min(1, "At least 1 question"),
});

// AFTER (Valibot)
const QuizSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  questions: v.pipe(
    v.array(
      v.object({
        text: v.pipe(v.string(), v.minLength(1)),
        type: v.enum(QuestionType),
        options: v.pipe(
          v.array(
            v.object({
              text: v.pipe(v.string(), v.minLength(1)),
              isCorrect: v.boolean(),
            })
          ),
          v.minLength(2, "At least 2 options"),
        ),
      })
    ),
    v.minLength(1, "At least 1 question"),
  ),
});
```

---

## 7. Transform with conditional logic

```ts
// BEFORE (Zod)
const CountrySchema = z.string().length(2).or(z.literal("")).transform((v) => v || null);

// AFTER (Valibot)
const CountrySchema = v.pipe(
  v.union([v.pipe(v.string(), v.length(2)), v.literal("")]),
  v.transform((val) => val || null)
);
```

---

## 8. Parse utility wrapper migration

```ts
// BEFORE (Zod)
import { z } from 'zod';

type ParseResult<T> = { success: true; data: T } | { success: false; errors: Record<string, string> };

function parseFormData<T>(formData: FormData, schema: z.ZodSchema<T>): ParseResult<T> {
  const data = Object.fromEntries(formData);
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) errors[path] = issue.message;
  }
  return { success: false, errors };
}

// AFTER (Valibot)
import * as v from 'valibot';

type ParseResult<T> = { success: true; data: T } | { success: false; errors: Record<string, string> };

function parseFormData<T>(formData: FormData, schema: v.GenericSchema<unknown, T>): ParseResult<T> {
  const data = Object.fromEntries(formData);
  const result = v.safeParse(schema, data);
  if (result.success) {
    return { success: true, data: result.output };
  }
  const flat = v.flatten<typeof schema>(result.issues);
  const errors: Record<string, string> = {};
  if (flat.nested) {
    for (const [path, messages] of Object.entries(flat.nested)) {
      if (messages?.[0]) errors[path] = messages[0];
    }
  }
  return { success: false, errors };
}
```

---

## 9. Refine with path forwarding (password confirmation)

```ts
// BEFORE (Zod)
const PasswordSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// AFTER (Valibot)
const PasswordSchema = v.pipe(
  v.object({
    password: v.pipe(v.string(), v.minLength(8)),
    confirmPassword: v.string(),
  }),
  v.forward(
    v.check((data) => data.password === data.confirmPassword, "Passwords don't match"),
    ['confirmPassword']
  )
);
```

---

## 10. Pick, Omit, Partial, Extend

```ts
// BEFORE (Zod)
const FullUser = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
  role: z.enum(['admin', 'user']),
});

const CreateUser = FullUser.omit({ id: true });
const UpdateUser = FullUser.pick({ name: true, email: true }).partial();
const AdminUser = FullUser.extend({ permissions: z.array(z.string()) });

// AFTER (Valibot)
const FullUser = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  password: v.string(),
  role: v.picklist(['admin', 'user']),
});

const CreateUser = v.omit(FullUser, ['id']);
const UpdateUser = v.partial(v.pick(FullUser, ['name', 'email']));
const AdminUser = v.object({ ...FullUser.entries, permissions: v.array(v.string()) });
```

---

## 11. JSON body parsing (API routes)

```ts
// BEFORE (Zod)
const VideoTrackingSchema = z.object({
  lessonId: z.string(),
  timestamp: z.number().nonnegative(),
  duration: z.number().positive(),
  completed: z.boolean().default(false),
});

async function parseJsonBody<T>(request: Request, schema: z.ZodSchema<T>) {
  const body = await request.json();
  return schema.safeParse(body);
}

// AFTER (Valibot)
const VideoTrackingSchema = v.object({
  lessonId: v.string(),
  timestamp: v.pipe(v.number(), v.minValue(0)),
  duration: v.pipe(v.number(), v.gtValue(0)),
  completed: v.optional(v.boolean(), false),
});

async function parseJsonBody<T>(request: Request, schema: v.GenericSchema<unknown, T>) {
  const body = await request.json();
  return v.safeParse(schema, body);
}
```

---

## 12. Recursive / self-referencing schema

```ts
// BEFORE (Zod)
type Category = { name: string; children: Category[] };

const CategorySchema: z.ZodType<Category> = z.object({
  name: z.string(),
  children: z.lazy(() => z.array(CategorySchema)),
});

// AFTER (Valibot)
type Category = { name: string; children: Category[] };

const CategorySchema: v.GenericSchema<Category> = v.object({
  name: v.string(),
  children: v.lazy(() => v.array(CategorySchema)),
});
```

---

## 13. Dependency update

```json
// package.json BEFORE
{
  "dependencies": {
    "zod": "^3.23.0"
  }
}

// package.json AFTER
{
  "dependencies": {
    "valibot": "^1.0.0"
  }
}
```

Install command:
```bash
pnpm remove zod && pnpm add valibot
```
