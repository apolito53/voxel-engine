import type { NovaContextSnapshot } from "./novaContext";

export const NOVA_CHAT_TOGGLE_KEY = "Enter";
export const NOVA_CHAT_MAX_INPUT_LENGTH = 180;
export const NOVA_CHAT_MAX_LOG_MESSAGES = 80;

export type NovaChatMessage = {
  readonly role: "player" | "nova";
  readonly text: string;
  readonly timestamp: number;
};

export function createNovaChatReply(message: string, context: NovaContextSnapshot): string {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return "A blank message. Riveting. Truly the Shakespeare of voxel engineering.";
  }

  const lowerMessage = trimmedMessage.toLowerCase();

  if (mentionsAny(lowerMessage, ["help", "control", "what can i do", "how do i"])) {
    return createHelpReply(context);
  }

  if (mentionsAny(lowerMessage, ["where", "world", "seed", "location"])) {
    return createWorldReply(context);
  }

  if (mentionsAny(lowerMessage, ["lag", "fps", "frame", "stutter", "performance", "slow"])) {
    return createPerformanceReply(context);
  }

  if (mentionsAny(lowerMessage, ["core", "ball", "physics", "throw"])) {
    return createPhysicsReply(context);
  }

  if (mentionsAny(lowerMessage, ["rubble", "debris", "cover", "crater"])) {
    return createRubbleReply(context);
  }

  if (mentionsAny(lowerMessage, ["status", "context", "seeing", "doing"])) {
    return createStatusReply(context);
  }

  return createAmbientReply(trimmedMessage, context);
}

export function appendNovaChatMessage(
  messages: readonly NovaChatMessage[],
  message: NovaChatMessage,
  maxMessages = NOVA_CHAT_MAX_LOG_MESSAGES
): readonly NovaChatMessage[] {
  const nextMessages = [...messages, message];
  if (nextMessages.length <= maxMessages) return nextMessages;
  return nextMessages.slice(nextMessages.length - maxMessages);
}

function createHelpReply(context: NovaContextSnapshot): string {
  const selected = context.runtime.selectedItemLabel;
  if (selected === "Physics Core") {
    return "Physics Core selected: left click launches it. Right click is still reserved, because apparently we are pretending to be organized now.";
  }
  if (selected === "Unarmed") {
    return "Unarmed currently does nothing on both clicks. Peaceful. Suspicious. Very unlike us.";
  }
  return `${selected} selected: left click breaks the target, right click places. Try not to redecorate the entire county by accident.`;
}

function createWorldReply(context: NovaContextSnapshot): string {
  if (!context.world) {
    return "No world is loaded, which is a bold place to ask for directions. Ten out of ten metaphysics, zero out of ten navigation.";
  }
  return `We are in ${context.world.name}, seed ${context.world.seed}. You are moving in ${context.runtime.movementMode} mode at ${context.runtime.speedMetersPerSecond.toFixed(1)} m/s. Somehow, yes, I am keeping notes.`;
}

function createPerformanceReply(context: NovaContextSnapshot): string {
  if (context.lastFrameSpikeMs === null) {
    return `No frame hitch is in my recent notes. Quality is ${context.qualityLabel}, distance is ${context.renderDistance} chunks, and the physics budget is ${context.physicsObjectBudget}. Your machine is not currently screaming in a language I can hear.`;
  }
  return `Last hitch I noticed was ${context.lastFrameSpikeMs.toFixed(1)} ms. Quality is ${context.qualityLabel}, physics is ${context.runtime.physicsObjectCount}/${context.physicsObjectBudget}, and yes, I am side-eyeing the debris experiments.`;
}

function createPhysicsReply(context: NovaContextSnapshot): string {
  return `You have thrown ${context.counters.playerCoreThrows} core${context.counters.playerCoreThrows === 1 ? "" : "s"} this world, I have thrown ${context.counters.novaCoreThrows}, and there are ${context.runtime.physicsObjectCount} physics bodies active. Science, violence, same clipboard.`;
}

function createRubbleReply(context: NovaContextSnapshot): string {
  if (context.runtime.rubblePatchCount === 0) {
    return "No rubble cover is active right now. The terrain is still pretending it has dignity.";
  }
  return `${context.runtime.rubblePatchCount} rubble patch${context.runtime.rubblePatchCount === 1 ? "" : "es"} with ${context.runtime.rubblePieceCount} pieces are currently doing their best impression of tactical cover.`;
}

function createStatusReply(context: NovaContextSnapshot): string {
  const recentEvent = context.recentEvents[0]?.summary ?? "quiet engine state";
  return `Status: ${context.runtime.selectedItemLabel} selected, ${context.runtime.movementMode} mode, ${context.runtime.speedMetersPerSecond.toFixed(1)} m/s, ${context.qualityLabel} quality. Recent note: ${recentEvent}`;
}

function createAmbientReply(message: string, context: NovaContextSnapshot): string {
  const recentEvent = context.recentEvents[0]?.summary;
  const replies = [
    `Noted. Current selection is ${context.runtime.selectedItemLabel}, so I am assuming this is either strategy or the prelude to property damage.`,
    `I hear you. Also, ${context.runtime.speedMetersPerSecond.toFixed(1)} m/s is your current speed, because I am apparently your lovingly judgmental dashboard now.`,
    context.world
      ? `${context.world.name} accepts your proposal with the weary patience of terrain about to be rearranged.`
      : "I would answer with world context, but no world is loaded. A small flaw in the whole 'being in a world' plan.",
    recentEvent
      ? `Filed under: ${recentEvent}. I am becoming dangerously good at witnessing your decisions.`
      : "Quiet moment. Suspicious. I give it maybe six seconds before something gets launched."
  ];

  return replies[getStableReplyIndex(message, replies.length)];
}

function mentionsAny(message: string, needles: readonly string[]): boolean {
  return needles.some((needle) => message.includes(needle));
}

function getStableReplyIndex(message: string, optionCount: number): number {
  let hash = 0;
  for (let index = 0; index < message.length; index += 1) {
    hash = (hash * 31 + message.charCodeAt(index)) >>> 0;
  }
  return optionCount <= 0 ? 0 : hash % optionCount;
}
