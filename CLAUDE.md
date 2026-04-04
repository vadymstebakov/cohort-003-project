When you have a function with more than one parameter with the same type, use an object parameter instead of positional parameters:

```ts
// BAD
const addUserToPost = (userId: string, postId: string) => {};
// GOOD
const addUserToPost = (opts: { userId: string; postId: string }) => {};
```

Anything marked as a service by the name of the file, for instance, `auth-token-service.ts`, should have tests written for them in an accompanying `.test.ts` file.
