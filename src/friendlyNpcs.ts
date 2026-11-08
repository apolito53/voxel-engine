import {
  findNpcStandPosition,
  FRIENDLY_NPC_HEIGHT,
  FRIENDLY_NPC_MAX_DROP,
  FRIENDLY_NPC_STEP_HEIGHT,
  hasNpcLineOfSight,
  isNpcBodyClear,
  moveNpcOnGround,
  type FriendlyNpcPosition,
  type FriendlyNpcWorld
} from "./friendlyNpcNavigation";

export const FRIENDLY_NPC_POPULATION = 3;
export const FRIENDLY_NPC_TALK_REACH = 3.4;
export const FRIENDLY_NPC_NOTICE_REACH = 6.5;
export const FRIENDLY_NPC_SPEED = 0.85;

export const FRIENDLY_NPC_ROSTER = [
  {
    id: "mira", name: "Mira", coat: 0x398b91, accent: 0xffc75d, skin: 0xc8906c, hair: 0x302a2c,
    greeting: "Oh, hello! A little company makes a big world feel smaller.",
    hints: ["Try F to fly. The view up there is worth the trip.", "I like the quiet patches between all the spectacular craters."]
  },
  {
    id: "bram", name: "Bram", coat: 0xc3863f, accent: 0x4c635e, skin: 0x8d6049, hair: 0x372922,
    greeting: "Hey, neighbor. Just taking the scenic route.",
    hints: ["I opens your Inventory. Plenty of building material in there.", "One good place to sit. That's usually where a settlement starts."]
  },
  {
    id: "fern", name: "Fern", coat: 0xb65d64, accent: 0xb9d69b, skin: 0xe1b28c, hair: 0x70442d,
    greeting: "Hi! I was wondering who else was wandering out here.",
    hints: ["The Blocks lane is a good place to start a little shelter.", "I'm still exploring. There's always another hill to peek over."]
  }
] as const;

export type FriendlyNpcId = typeof FRIENDLY_NPC_ROSTER[number]["id"];
export type FriendlyNpcState = "idle" | "wandering" | "noticing" | "waiting";
export type FriendlyNpcMessage = {
  readonly npcId: FriendlyNpcId;
  readonly name: string;
  readonly text: string;
  readonly kind: "greeting" | "talk";
};
export type FriendlyNpcCharacterSnapshot = {
  readonly id: FriendlyNpcId;
  readonly name: string;
  readonly position: FriendlyNpcPosition;
  readonly yaw: number;
  readonly state: FriendlyNpcState;
  readonly visible: boolean;
  readonly walkPhase: number;
  readonly greetingSeconds: number;
};
export type FriendlyNpcSnapshot = {
  readonly population: readonly FriendlyNpcCharacterSnapshot[];
  readonly nearbyNpcId: FriendlyNpcId | null;
  readonly message: FriendlyNpcMessage | null;
  readonly elapsedSeconds: number;
};

type NpcRecord = {
  readonly id: FriendlyNpcId;
  readonly name: string;
  readonly home: FriendlyNpcPosition;
  position: FriendlyNpcPosition;
  yaw: number;
  travelYaw: number;
  state: FriendlyNpcState;
  visible: boolean;
  walkPhase: number;
  stateSeconds: number;
  routeSeconds: number;
  greetingSeconds: number;
  greetingCooldown: number;
  retrySeconds: number;
  talkCount: number;
};

/** Transient per-visit people. No storage, scene, timers, chunk creation or Nova ownership. */
export class FriendlyNpcSimulation {
  private readonly initialSeed: number;
  private randomState: number;
  private population: NpcRecord[] = [];
  private elapsedSeconds = 0;
  private nearbyNpcId: FriendlyNpcId | null = null;
  private message: FriendlyNpcMessage | null = null;
  private messageSeconds = 0;

  constructor(seed = 117) {
    this.initialSeed = seed | 0 || 117;
    this.randomState = this.initialSeed;
  }

  seed(world: FriendlyNpcWorld, playerFeet: FriendlyNpcPosition, forward: FriendlyNpcPosition = { x: 0, y: 0, z: -1 }): FriendlyNpcSnapshot {
    this.clear();
    if (![playerFeet.x, playerFeet.y, playerFeet.z].every(Number.isFinite)) return this.snapshot();
    const forwardLength = Math.hypot(forward.x, forward.z);
    const fx = Number.isFinite(forwardLength) && forwardLength > 0.001 ? forward.x / forwardLength : 0;
    const fz = Number.isFinite(forwardLength) && forwardLength > 0.001 ? forward.z / forwardLength : -1;
    // Try the initial view first, then a bounded fan/ring. In sparse or edited
    // worlds fewer people is preferable to unsafe or silently generated ground.
    for (let index = 0; index < FRIENDLY_NPC_POPULATION; index += 1) {
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const angle = (index - 1) * 0.43 + Math.floor(attempt / 3) * 1.13;
        const radius = 4.8 + index * 1.25 + attempt % 3 * 1.3;
        const x = playerFeet.x + (fx * Math.cos(angle) - fz * Math.sin(angle)) * radius;
        const z = playerFeet.z + (fz * Math.cos(angle) + fx * Math.sin(angle)) * radius;
        const position = findNpcStandPosition(world, x, z, Math.max(0, playerFeet.y - 14), playerFeet.y + 3);
        if (!position || this.population.some((npc) => horizontalDistance(npc.position, position) < 2)) continue;
        const roster = FRIENDLY_NPC_ROSTER[index];
        const yaw = Math.atan2(playerFeet.x - position.x, playerFeet.z - position.z);
        this.population.push({
          id: roster.id, name: roster.name, home: { ...position }, position, yaw, travelYaw: yaw + Math.PI,
          state: index === 0 ? "idle" : "wandering", visible: true, walkPhase: 0,
          stateSeconds: 1.2 + index * 0.6, routeSeconds: 0, greetingSeconds: 0,
          greetingCooldown: 0, retrySeconds: 0, talkCount: 0
        });
        break;
      }
    }
    return this.snapshot();
  }

  update(deltaSeconds: number, world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.1);
    this.elapsedSeconds += delta;
    this.messageSeconds = Math.max(0, this.messageSeconds - delta);
    if (this.messageSeconds === 0) this.message = null;
    for (const npc of this.population) {
      npc.greetingSeconds = Math.max(0, npc.greetingSeconds - delta);
      npc.greetingCooldown = Math.max(0, npc.greetingCooldown - delta);
      if (!this.refreshGround(npc, world, delta)) continue;
      const eye = npcEye(npc);
      const distance = horizontalDistance(npc.position, playerEye);
      const noticesPlayer = distance < FRIENDLY_NPC_NOTICE_REACH && Math.abs(eye.y - playerEye.y) < 2.6 &&
        hasNpcLineOfSight(world, eye, playerEye);
      if (noticesPlayer) {
        if (npc.greetingCooldown === 0 && distance < 4.5) {
          npc.greetingCooldown = 18;
          npc.greetingSeconds = 2.5;
          npc.stateSeconds = Math.max(npc.stateSeconds, 2.5);
          if (!this.message) this.showMessage(npc, "greeting", 4);
        }
        if (npc.state !== "noticing" && (npc.greetingSeconds > 0 || distance < 2.7)) {
          npc.state = "noticing";
          npc.stateSeconds = 2.5;
        }
      }
      npc.stateSeconds -= delta;
      if (npc.state === "noticing") {
        npc.yaw = approachAngle(npc.yaw, Math.atan2(playerEye.x - npc.position.x, playerEye.z - npc.position.z), delta * 7);
        if ((!noticesPlayer || distance >= 2.7) && npc.stateSeconds <= 0) this.startIdle(npc);
        continue;
      }
      if (npc.state === "idle") {
        if (noticesPlayer) npc.yaw = approachAngle(npc.yaw, Math.atan2(playerEye.x - npc.position.x, playerEye.z - npc.position.z), delta * 3);
        if (npc.stateSeconds <= 0) {
          npc.state = "wandering";
          npc.stateSeconds = 3 + this.random() * 4;
          npc.routeSeconds = 0;
        }
        continue;
      }
      if (npc.stateSeconds <= 0) {
        this.startIdle(npc);
        continue;
      }
      npc.routeSeconds -= delta;
      if (npc.routeSeconds <= 0 && !this.chooseRoute(npc, world, playerEye)) {
        this.startIdle(npc);
        continue;
      }
      const dx = Math.sin(npc.travelYaw) * FRIENDLY_NPC_SPEED * delta;
      const dz = Math.cos(npc.travelYaw) * FRIENDLY_NPC_SPEED * delta;
      const next = moveNpcOnGround(world, npc.position, dx, dz);
      if (!next || this.population.some((other) => other !== npc && other.visible && horizontalDistance(other.position, next) < 0.75)) {
        npc.routeSeconds = 0;
        continue;
      }
      npc.position = next;
      npc.yaw = approachAngle(npc.yaw, npc.travelYaw, delta * 6);
      npc.walkPhase += delta * 7.5;
    }
    this.nearbyNpcId = this.findTalkTarget(world, playerEye)?.id ?? null;
  }

  talk(world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition): FriendlyNpcMessage | null {
    const npc = this.findTalkTarget(world, playerEye);
    if (!npc) return null;
    npc.state = "noticing";
    npc.stateSeconds = 6;
    npc.greetingSeconds = 2;
    npc.yaw = Math.atan2(playerEye.x - npc.position.x, playerEye.z - npc.position.z);
    npc.greetingCooldown = 18;
    this.nearbyNpcId = npc.id;
    this.showMessage(npc, "talk", 6);
    npc.talkCount += 1;
    return this.message ? { ...this.message } : null;
  }

  clear(): void {
    this.population = [];
    this.elapsedSeconds = 0;
    this.nearbyNpcId = null;
    this.message = null;
    this.messageSeconds = 0;
    this.randomState = this.initialSeed;
  }

  snapshot(): FriendlyNpcSnapshot {
    return {
      population: this.population.map((npc) => ({
        id: npc.id, name: npc.name, position: { ...npc.position }, yaw: npc.yaw, state: npc.state,
        visible: npc.visible, walkPhase: npc.walkPhase, greetingSeconds: npc.greetingSeconds
      })),
      nearbyNpcId: this.nearbyNpcId,
      message: this.message ? { ...this.message } : null,
      elapsedSeconds: this.elapsedSeconds
    };
  }

  private refreshGround(npc: NpcRecord, world: FriendlyNpcWorld, delta: number): boolean {
    if (npc.visible) {
      const supported = findNpcStandPosition(world, npc.position.x, npc.position.z,
        npc.position.y - FRIENDLY_NPC_MAX_DROP, npc.position.y + FRIENDLY_NPC_STEP_HEIGHT);
      if (supported && isNpcBodyClear(world, npc.position)) {
        npc.position = supported;
        return true;
      }
      // Terrain can be erased under an idle person or placed through their
      // body. Hide immediately, then relocate locally rather than clip/fall.
      npc.visible = false;
      npc.state = "waiting";
      npc.retrySeconds = 0.75;
      if (this.message?.npcId === npc.id) this.message = null;
      return false;
    }
    npc.retrySeconds -= delta;
    if (npc.retrySeconds > 0) return false;
    npc.retrySeconds = 1;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const angle = attempt * Math.PI / 4;
      const radius = attempt === 0 ? 0 : 1.2;
      const candidate = findNpcStandPosition(world, npc.position.x + Math.sin(angle) * radius,
        npc.position.z + Math.cos(angle) * radius, npc.position.y - FRIENDLY_NPC_MAX_DROP,
        npc.position.y + FRIENDLY_NPC_STEP_HEIGHT);
      if (!candidate || this.population.some((other) => other !== npc && other.visible && horizontalDistance(other.position, candidate) < 0.8)) continue;
      npc.position = candidate;
      npc.visible = true;
      this.startIdle(npc);
      return true;
    }
    return false;
  }

  private chooseRoute(npc: NpcRecord, world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition): boolean {
    const homeDistance = horizontalDistance(npc.position, npc.home);
    const preferred = homeDistance > 6 ? Math.atan2(npc.home.x - npc.position.x, npc.home.z - npc.position.z)
      : npc.travelYaw + (this.random() - 0.5) * 1.4;
    const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.75, -Math.PI * 0.75];
    for (const offset of angles) {
      const yaw = preferred + offset;
      const next = moveNpcOnGround(world, npc.position, Math.sin(yaw) * 1.4, Math.cos(yaw) * 1.4);
      if (!next || horizontalDistance(next, npc.home) > 8) continue;
      if (horizontalDistance(next, playerEye) < 1.2 || this.population.some((other) =>
        other !== npc && other.visible && horizontalDistance(next, other.position) < 1)) continue;
      npc.travelYaw = yaw;
      npc.routeSeconds = 1 + this.random() * 1.2;
      return true;
    }
    return false;
  }

  private findTalkTarget(world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition): NpcRecord | null {
    let target: NpcRecord | null = null;
    let nearest = FRIENDLY_NPC_TALK_REACH;
    for (const npc of this.population) {
      if (!npc.visible) continue;
      const distance = horizontalDistance(npc.position, playerEye);
      if (distance > nearest || Math.abs(npcEye(npc).y - playerEye.y) > 2.4) continue;
      const support = findNpcStandPosition(world, npc.position.x, npc.position.z,
        npc.position.y - FRIENDLY_NPC_MAX_DROP, npc.position.y + FRIENDLY_NPC_STEP_HEIGHT);
      if (!support || Math.abs(support.y - npc.position.y) > 0.015 || !isNpcBodyClear(world, npc.position) ||
        !hasNpcLineOfSight(world, npcEye(npc), playerEye)) continue;
      nearest = distance;
      target = npc;
    }
    return target;
  }

  private showMessage(npc: NpcRecord, kind: FriendlyNpcMessage["kind"], seconds: number): void {
    const entry = FRIENDLY_NPC_ROSTER.find((candidate) => candidate.id === npc.id) ?? FRIENDLY_NPC_ROSTER[0];
    this.message = {
      npcId: npc.id, name: npc.name, kind,
      text: kind === "greeting" ? entry.greeting : entry.hints[npc.talkCount % entry.hints.length]
    };
    this.messageSeconds = seconds;
  }

  private startIdle(npc: NpcRecord): void {
    npc.state = "idle";
    npc.stateSeconds = 1.2 + this.random() * 2.4;
  }

  private random(): number {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4294967296;
  }
}

function npcEye(npc: NpcRecord): FriendlyNpcPosition {
  return { x: npc.position.x, y: npc.position.y + FRIENDLY_NPC_HEIGHT * 0.86, z: npc.position.z };
}

function horizontalDistance(a: FriendlyNpcPosition, b: FriendlyNpcPosition): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function approachAngle(from: number, to: number, blend: number): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * Math.min(1, blend);
}
