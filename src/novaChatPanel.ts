import {
  NOVA_CHAT_MAX_INPUT_LENGTH,
  appendNovaChatMessage,
  type NovaTerminalRoute,
  type NovaChatMessage
} from "./novaChat";

type NovaChatPanelOptions = {
  readonly root: HTMLElement;
  readonly log: HTMLElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly closeButton: HTMLButtonElement;
  readonly getNow?: () => number;
  readonly routeInput: (message: string) => NovaTerminalRoute;
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
  private readonly routeInput: (message: string) => NovaTerminalRoute;
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
    routeInput,
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
    this.routeInput = routeInput;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onMessage = onMessage;

    this.input.maxLength = NOVA_CHAT_MAX_INPUT_LENGTH;
    this.form.addEventListener("submit", (event) => this.submit(event));
    this.closeButton.addEventListener("click", () => this.close());
    this.addMessage("system", "Nova terminal online. Chat normally, run commands like /spawn target, or type help for the command list.");
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

    // Resolve before emitting the echo message so Nova chat replies use the
    // context leading into the prompt, not the prompt itself as "latest."
    const route = this.routeInput(playerMessage);
    this.addMessage(route.echoRole, route.echoText);
    this.addMessage(route.responseRole, route.responseText);
  }

  private addMessage(role: NovaChatMessage["role"], text: string): void {
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
        speaker.textContent = getSpeakerLabel(message.role);

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

function getSpeakerLabel(role: NovaChatMessage["role"]): string {
  switch (role) {
    case "player":
      return "You";
    case "nova":
      return "Nova";
    case "command":
      return "Command";
    case "system":
      return "System";
  }
}
