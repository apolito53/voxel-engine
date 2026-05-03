import {
  NOVA_CHAT_MAX_INPUT_LENGTH,
  appendNovaChatMessage,
  type NovaChatMessage
} from "./novaChat";
import type { NovaChatRole } from "./novaContext";

type NovaChatPanelOptions = {
  readonly root: HTMLElement;
  readonly log: HTMLElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly closeButton: HTMLButtonElement;
  readonly getNow?: () => number;
  readonly getReply: (message: string) => string;
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
  readonly onMessage?: (message: NovaChatMessage) => void;
};

export class NovaChatPanel {
  private readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly getNow: () => number;
  private readonly getReply: (message: string) => string;
  private readonly onOpen: () => void;
  private readonly onClose: () => void;
  private readonly onMessage: (message: NovaChatMessage) => void;
  private messages: readonly NovaChatMessage[] = [];

  constructor({
    root,
    log,
    form,
    input,
    closeButton,
    getNow = () => performance.now(),
    getReply,
    onOpen = () => {},
    onClose = () => {},
    onMessage = () => {}
  }: NovaChatPanelOptions) {
    this.root = root;
    this.log = log;
    this.form = form;
    this.input = input;
    this.closeButton = closeButton;
    this.getNow = getNow;
    this.getReply = getReply;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onMessage = onMessage;

    this.input.maxLength = NOVA_CHAT_MAX_INPUT_LENGTH;
    this.form.addEventListener("submit", (event) => this.submit(event));
    this.closeButton.addEventListener("click", () => this.close());
    this.addMessage("nova", "Nova link established. Ask me what I am seeing, or just make a terrible decision and let me narrate it.");
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("is-hidden");
  }

  open(): void {
    if (this.isOpen) return;

    this.root.classList.remove("is-hidden");
    this.root.setAttribute("aria-hidden", "false");
    this.onOpen();
    this.input.focus();
    this.input.select();
  }

  close(): void {
    if (!this.isOpen) return;

    this.root.classList.add("is-hidden");
    this.root.setAttribute("aria-hidden", "true");
    this.input.value = "";
    this.onClose();
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }

    this.open();
  }

  private submit(event: SubmitEvent): void {
    event.preventDefault();

    const playerMessage = this.input.value.trim();
    this.input.value = "";
    if (playerMessage.length === 0) return;

    // Generate before emitting the player chat event so replies use the game
    // context leading into the question, not the question itself as "latest."
    const novaReply = this.getReply(playerMessage);
    this.addMessage("player", playerMessage);
    this.addMessage("nova", novaReply);
  }

  private addMessage(role: NovaChatRole, text: string): void {
    const message: NovaChatMessage = {
      role,
      text,
      timestamp: this.getNow()
    };

    this.messages = appendNovaChatMessage(this.messages, message);
    this.onMessage(message);
    this.render();
  }

  private render(): void {
    this.log.replaceChildren(
      ...this.messages.map((message) => {
        const row = document.createElement("div");
        row.className = `nova-chat-message is-${message.role}`;

        const speaker = document.createElement("span");
        speaker.className = "nova-chat-speaker";
        speaker.textContent = message.role === "player" ? "You" : "Nova";

        const text = document.createElement("span");
        text.className = "nova-chat-text";
        text.textContent = message.text;

        row.append(speaker, text);
        return row;
      })
    );
    this.log.scrollTop = this.log.scrollHeight;
  }
}
