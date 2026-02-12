# Fix Phase 2 Gaps: Empty Text Guard & Quoted Message Handling

## Context

During Phase 2 verification, two minor gaps were found in `src/lib/webhook/normalize.ts`:

1. Messages classified as "text" type but with empty/whitespace-only content pass through guards
2. Quoted message handling needs verification — currently `extendedTextMessage.text` is used, which in Evolution API v2 already contains only the new reply text (the quoted original is in `contextInfo.quotedMessage`), so this is actually correct but should be explicitly documented via the Zod schema

---

## Changes

**File:** `src/lib/webhook/normalize.ts`

### 1. Add empty text guard in `applyGuards()`

After the message type checks (~line 144), add a check: if `message.text` is empty after normalization, return `shouldProcess: false` with no auto-reply (silent ignore, same as sticker behavior — there's no meaningful text to respond to).

```typescript
// After messageType === "text" passes (line 144), before the final return:
if (!message.text) {
  return {
    shouldProcess: false,
    reason: "empty_text",
    requiresAutoReply: false,
  };
}
```

### 2. Add `contextInfo` to Zod schema for `extendedTextMessage`

Update `extendedTextMessage` schema (line 9) to explicitly include `contextInfo` as optional, making the quoted message structure visible in types. This documents the quoted message structure without changing behavior — `extendedTextMessage.text` already correctly returns only the new reply text.

```typescript
extendedTextMessage: z.object({
  text: z.string(),
  contextInfo: z.object({
    quotedMessage: z.unknown().optional(),
  }).optional(),
}).optional(),
```

---

## Verification

- A webhook with `message.conversation: "   "` (whitespace only) should be silently ignored
- A webhook with `message.conversation: ""` (empty string) should be silently ignored
- A quoted reply message should still extract only the new text from `extendedTextMessage.text`
- Existing guards (fromMe, groups, media) remain unaffected
- TypeScript compiles without errors (`npx tsc --noEmit`)
