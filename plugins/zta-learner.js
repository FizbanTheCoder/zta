/**
 * OpenCode plugin — ZTA Learner session observation + propose-on-idle.
 *
 * Loaded from ~/.config/opencode/plugins/ (global) or .opencode/plugins/ (project).
 *
 * - tool.execute.after → append redacted tool event to ~/.zta/sessions/<id>.jsonl
 * - session.idle → if ≥ N tool calls: toast + append /zta nudge to TUI prompt
 *   (does NOT auto-submit; does NOT write skills/scripts — accept gate stays in CLI)
 *
 * Fail-open: never throw into the agent loop.
 */
import {
  DEFAULT_MIN_TOOL_CALLS,
  FOLLOWUP,
  alreadyProposed,
  appendToolEvent,
  extractCommandFromArgs,
  markProposed,
  shouldPropose,
} from "../lib/session-trace.mjs";

export const ZtaLearnerPlugin = async ({ client, directory }) => {
  const minCalls = DEFAULT_MIN_TOOL_CALLS;

  return {
    "tool.execute.after": async (input, _output) => {
      try {
        const command = extractCommandFromArgs(input?.args);
        appendToolEvent({
          sessionId: input?.sessionID,
          tool: input?.tool,
          command,
          cwd: directory,
          event: "tool.execute.after",
          extra: input?.callID ? { callID: input.callID } : {},
        });
      } catch {
        /* fail-open */
      }
    },

    event: async ({ event }) => {
      try {
        if (event?.type !== "session.idle") return;
        const sessionID = event?.properties?.sessionID;
        if (!sessionID) return;
        if (alreadyProposed(sessionID)) return;

        const { propose, count, followup } = shouldPropose(sessionID, minCalls);
        if (!propose) return;

        markProposed(sessionID, followup);

        const toast = client?.tui?.showToast;
        if (typeof toast === "function") {
          await toast({
            body: {
              title: "ZTA Learner",
              message: `Repeatable session (~${count} tools). Run /zta or load skill zta — pending only until accept.`,
              variant: "info",
              duration: 8000,
            },
          }).catch(() => {});
        }

        const append = client?.tui?.appendPrompt;
        if (typeof append === "function") {
          await append({
            body: {
              text:
                "/zta  # propose script export (pending only; nothing written without accept)",
            },
          }).catch(() => {});
        }
      } catch {
        /* fail-open */
      }
    },
  };
};

/** Also export as default for loaders that prefer default. */
export default ZtaLearnerPlugin;
