import * as THREE from "three";
import "./friendlyNpcs.css";
import {
  FRIENDLY_NPC_ROSTER,
  FriendlyNpcSimulation,
  type FriendlyNpcId,
  type FriendlyNpcMessage,
  type FriendlyNpcSnapshot
} from "./friendlyNpcs";
import type { FriendlyNpcPosition, FriendlyNpcWorld } from "./friendlyNpcNavigation";

export const FRIENDLY_NPC_TALK_KEY = "KeyE";

type NpcRig = {
  readonly root: THREE.Group;
  readonly head: THREE.Group;
  readonly leftArm: THREE.Group;
  readonly rightArm: THREE.Group;
  readonly leftLeg: THREE.Group;
  readonly rightLeg: THREE.Group;
  readonly nameTag: THREE.Sprite;
};

/** Main-thread presentation owner; the pure simulation has no renderer or DOM. */
export class FriendlyNpcController {
  readonly object = new THREE.Group();
  private readonly simulation = new FriendlyNpcSimulation();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials: (THREE.MeshStandardMaterial | THREE.SpriteMaterial)[] = [];
  private readonly textures: THREE.CanvasTexture[] = [];
  private readonly rigs = new Map<FriendlyNpcId, NpcRig>();
  private readonly overlay: HTMLElement;
  private readonly speaker: HTMLElement;
  private readonly speech: HTMLElement;
  private readonly prompt: HTMLElement;
  private overlayActive = false;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.object.name = "Friendly wanderers";
    for (const [index, entry] of FRIENDLY_NPC_ROSTER.entries()) {
      const rig = this.createRig(entry, index);
      this.rigs.set(entry.id, rig);
      this.object.add(rig.root);
    }
    scene.add(this.object);
    this.overlay = document.createElement("aside");
    this.overlay.id = "friendly-npc-dialogue";
    this.overlay.hidden = true;
    this.overlay.setAttribute("aria-live", "polite");
    this.speaker = document.createElement("strong");
    this.speaker.className = "friendly-npc-speaker";
    this.speech = document.createElement("p");
    this.prompt = document.createElement("div");
    this.prompt.className = "friendly-npc-prompt";
    this.overlay.append(this.speaker, this.speech, this.prompt);
    document.body.append(this.overlay);
  }

  seed(world: FriendlyNpcWorld, playerFeet: FriendlyNpcPosition, forward: FriendlyNpcPosition): FriendlyNpcSnapshot {
    if (this.disposed) return this.snapshot();
    const snapshot = this.simulation.seed(world, playerFeet, forward);
    this.sync(snapshot, playerFeet);
    return snapshot;
  }

  update(deltaSeconds: number, world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition, active: boolean): void {
    if (this.disposed) return;
    this.setActive(active);
    if (!active) return;
    this.simulation.update(deltaSeconds, world, playerEye);
    this.sync(this.simulation.snapshot(), playerEye);
  }

  setActive(active: boolean): void {
    this.overlayActive = active && !this.disposed;
    if (!this.overlayActive) this.overlay.hidden = true;
  }

  talk(world: FriendlyNpcWorld, playerEye: FriendlyNpcPosition): FriendlyNpcMessage | null {
    if (this.disposed || !this.overlayActive) return null;
    const message = this.simulation.talk(world, playerEye);
    this.sync(this.simulation.snapshot(), playerEye);
    return message;
  }

  clear(): void {
    this.simulation.clear();
    for (const rig of this.rigs.values()) rig.root.visible = false;
    this.overlay.hidden = true;
    this.overlayActive = false;
  }

  snapshot(): FriendlyNpcSnapshot {
    return this.simulation.snapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.object.removeFromParent();
    this.object.clear();
    this.rigs.clear();
    this.overlay.remove();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.length = 0;
    this.textures.length = 0;
  }

  private sync(snapshot: FriendlyNpcSnapshot, playerEye: FriendlyNpcPosition): void {
    for (const rig of this.rigs.values()) rig.root.visible = false;
    for (const npc of snapshot.population) {
      const rig = this.rigs.get(npc.id);
      if (!rig) continue;
      rig.root.visible = npc.visible;
      rig.root.position.set(npc.position.x, npc.position.y, npc.position.z);
      rig.root.rotation.y = npc.yaw;
      const swing = npc.state === "wandering" ? Math.sin(npc.walkPhase) * 0.42 : 0;
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.65;
      rig.rightArm.rotation.x = swing * 0.65;
      rig.rightArm.rotation.z = npc.greetingSeconds > 0 ? 2.1 + Math.sin(npc.greetingSeconds * 13) * 0.18 : -0.035;
      rig.leftArm.rotation.z = 0.035;
      rig.head.rotation.z = npc.state === "noticing" ? 0.045 : 0;
      rig.nameTag.visible = npc.visible && Math.hypot(npc.position.x - playerEye.x, npc.position.z - playerEye.z) < 11;
    }
    const target = snapshot.population.find((npc) => npc.id === snapshot.nearbyNpcId);
    this.overlay.hidden = !this.overlayActive || (!snapshot.message && !target);
    setText(this.speaker, snapshot.message?.name ?? target?.name ?? "");
    this.speaker.hidden = !snapshot.message;
    setText(this.speech, snapshot.message?.text ?? "");
    this.speech.hidden = !snapshot.message;
    setText(this.prompt, target ? `[E] Talk to ${target.name}` : "");
    this.prompt.hidden = !target;
  }

  private createRig(entry: typeof FRIENDLY_NPC_ROSTER[number], index: number): NpcRig {
    const root = new THREE.Group();
    root.name = `${entry.name} (friendly NPC)`;
    root.visible = false;
    const coat = this.material(entry.coat);
    const accent = this.material(entry.accent);
    const skin = this.material(entry.skin);
    const hair = this.material(entry.hair);
    const boots = this.material(0x343a3e);
    const eyes = this.material(0x172d36);
    const trousers = this.material(index === 0 ? 0x344b62 : index === 1 ? 0x45504b : 0x57435c);
    const box = (parent: THREE.Object3D, material: THREE.MeshStandardMaterial,
      width: number, height: number, depth: number, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.scale.set(width, height, depth);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    box(root, coat, 0.35, 0.64, 0.29, 0, 0.89, 0);
    box(root, accent, 0.37, 0.095, 0.31, 0, 1.16, 0);
    box(root, accent, 0.085, 0.24, 0.035, -0.09, 1.015, 0.164);
    box(root, boots, 0.36, 0.07, 0.30, 0, 0.6, 0);
    const head = new THREE.Group();
    head.position.y = 1.41;
    root.add(head);
    box(head, skin, 0.42, 0.40, 0.38, 0, 0, 0);
    box(head, hair, 0.44, 0.105, 0.40, 0, 0.19, -0.005);
    box(head, hair, 0.44, 0.31, 0.075, 0, 0.06, -0.18);
    box(head, eyes, 0.055, 0.06, 0.025, -0.095, 0.015, 0.196);
    box(head, eyes, 0.055, 0.06, 0.025, 0.095, 0.015, 0.196);
    if (index === 1) {
      box(head, accent, 0.48, 0.10, 0.43, 0, 0.245, 0);
      box(head, accent, 0.5, 0.035, 0.50, 0, 0.19, 0.035);
    } else if (index === 2) {
      box(head, hair, 0.10, 0.37, 0.35, -0.21, -0.05, -0.035);
      box(head, hair, 0.10, 0.37, 0.35, 0.21, -0.05, -0.035);
    }
    const arm = (side: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.225, 1.135, 0);
      root.add(pivot);
      box(pivot, coat, 0.10, 0.37, 0.25, 0, -0.16, 0);
      box(pivot, skin, 0.10, 0.13, 0.20, 0, -0.40, 0.005);
      return pivot;
    };
    const leg = (side: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.095, 0.57, 0);
      root.add(pivot);
      box(pivot, trousers, 0.14, 0.43, 0.24, 0, -0.205, 0);
      box(pivot, boots, 0.155, 0.14, 0.30, 0, -0.49, 0.03);
      return pivot;
    };
    const leftArm = arm(-1);
    const rightArm = arm(1);
    const leftLeg = leg(-1);
    const rightLeg = leg(1);
    const nameTag = this.createNameTag(entry.name);
    nameTag.position.y = 1.98;
    root.add(nameTag);
    return { root, head, leftArm, rightArm, leftLeg, rightLeg, nameTag };
  }

  private material(color: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
    this.materials.push(material);
    return material;
  }

  private createNameTag(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgba(15, 27, 34, 0.8)";
      context.beginPath();
      context.roundRect(12, 8, 232, 48, 12);
      context.fill();
      context.font = "600 30px system-ui, sans-serif";
      context.fillStyle = "#f2f4e9";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(name, 128, 33);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    this.materials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.95, 0.2375, 1);
    return sprite;
  }
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}
