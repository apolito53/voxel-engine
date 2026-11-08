export interface MenuTabOptions {
  readonly signal: AbortSignal;
  readonly onSelect?: (id: string) => void;
}

export interface MenuTabs {
  readonly selectedId: string;
  select(id: string, focus?: boolean): void;
  focusActive(): void;
}

/** DOM-only tab navigation. Gameplay, inventories, and preferences stay with their owners. */
export function createMenuTabs(tabList: HTMLElement, options: MenuTabOptions): MenuTabs {
  const tabs = Array.from(tabList.querySelectorAll<HTMLButtonElement>(":scope > [role='tab']"));
  const entries = tabs.map((tab) => {
    const panelId = tab.getAttribute("aria-controls");
    const panel = panelId ? tabList.ownerDocument.getElementById(panelId) : null;
    if (!tab.id || !panel) throw new Error(`Menu tab ${tab.id || "(unnamed)"} needs an owned panel.`);
    return { tab, panel };
  });
  if (entries.length === 0) throw new Error("A menu tab group needs at least one tab.");

  let selectedId = entries.find(({ tab }) => tab.getAttribute("aria-selected") === "true")?.tab.id
    ?? entries[0].tab.id;

  function focusTab(tab: HTMLButtonElement): void {
    tab.focus({ preventScroll: true });
    // The category rail scrolls on short desktop windows; narrow screens use
    // the menu content scroller instead. Reveal focus with minimal scrolling.
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function select(id: string, focus = false): void {
    const selected = entries.find(({ tab }) => tab.id === id);
    if (!selected || selected.tab.disabled) return;
    const changed = selectedId !== id;
    selectedId = id;
    for (const { tab, panel } of entries) {
      const active = tab.id === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle("is-active", active);
      panel.hidden = !active;
    }
    if (changed) options.onSelect?.(id);
    if (focus) focusTab(selected.tab);
  }

  for (const { tab } of entries) {
    tab.addEventListener("click", () => select(tab.id), { signal: options.signal });
    tab.addEventListener("keydown", (event) => {
      const enabledTabs = tabs.filter((candidate) => !candidate.disabled);
      const index = enabledTabs.indexOf(tab);
      const vertical = tabList.getAttribute("aria-orientation") === "vertical";
      const nextIndex = getMenuTabKeyIndex(event.key, index, enabledTabs.length, vertical);
      if (nextIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      select(enabledTabs[nextIndex].id, true);
    }, { signal: options.signal });
  }
  select(selectedId);

  return {
    get selectedId() { return selectedId; },
    select,
    focusActive: () => {
      const tab = entries.find(({ tab }) => tab.id === selectedId)?.tab;
      if (tab) focusTab(tab);
    }
  };
}

export function getMenuTabKeyIndex(
  key: string,
  current: number,
  count: number,
  vertical = false
): number | null {
  if (count < 1 || current < 0 || current >= count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === (vertical ? "ArrowDown" : "ArrowRight")) return (current + 1) % count;
  if (key === (vertical ? "ArrowUp" : "ArrowLeft")) return (current + count - 1) % count;
  return null;
}

/** Keep keyboard focus inside the topmost menu without changing its Escape policy. */
export function trapMenuFocus(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']"
  )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = root.ownerDocument.activeElement;
  if (!root.contains(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
