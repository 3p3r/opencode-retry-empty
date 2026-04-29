import type { Plugin } from "@opencode-ai/plugin";
import { backOff } from "exponential-backoff";
import Debug from "debug";

export interface RetryOptions {
  maxRetries?: number;
  minLength?: number;
  retryMessage?: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export default {
  id: "opencode-retry-empty",
  server: async (
    { client }: Parameters<Plugin>[0],
    options: RetryOptions = {}
  ) => {
    const maxRetries = options.maxRetries ?? 3;
    const minLength = options.minLength ?? 1;
    const retryMessage =
      options.retryMessage ?? "Please provide a complete response.";
    const baseDelayMs = options.baseDelayMs ?? 1000;
    const maxDelayMs = options.maxDelayMs ?? 10000;

    const log = Debug("opencode:retry:empty");
    const retries = new Map<string, number>();

    return {
      "experimental.text.complete": async (
        input: { sessionID: string; messageID: string; partID: string },
        output: { text: string }
      ) => {
        if (output.text.length >= minLength) {
          retries.delete(input.sessionID);
          return;
        }

        const count = retries.get(input.sessionID) ?? 0;
        if (count >= maxRetries) {
          log("max retries reached for session=%s", input.sessionID);
          retries.delete(input.sessionID);
          return;
        }

        retries.set(input.sessionID, count + 1);

        log("empty response detected: session=%s length=%d", input.sessionID, output.text.length);

        try {
          await backOff(
            async () => {
              await client.session.promptAsync({
                path: { id: input.sessionID },
                body: {
                  parts: [{ type: "text" as const, text: retryMessage }],
                },
              });
            },
            {
              numOfAttempts: maxRetries + 1,
              startingDelay: baseDelayMs,
              timeMultiple: 2,
              maxDelay: maxDelayMs,
              retry: (e: unknown, attemptNumber: number) => {
                log("retry error: %o", e);
                log("retrying session=%s attempt=%d", input.sessionID, attemptNumber);
                return attemptNumber <= maxRetries;
              },
            }
          );
          log("retry succeeded for session=%s", input.sessionID);
        } catch (e: unknown) {
          log("max retries reached for session=%s", input.sessionID);
          log("retry error: %o", e);
        }
      },

      event: async ({ event }: { event: { type: string; properties?: any } }) => {
        if (
          event.type !== "session.deleted" &&
          event.type !== "session.error"
        ) {
          return;
        }
        const sid =
          event.properties?.sessionID ?? event.properties?.info?.id;
        if (sid) retries.delete(sid);
      },
    };
  },
};
