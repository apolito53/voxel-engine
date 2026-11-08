import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMenuTabs, getMenuTabKeyIndex } from "../src/menuNavigation";

class MenuElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, enabled: boolean) => {
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
    }
  };
  disabled = false;
  hidden = false;
  tabIndex = 0;
  focusCount = 0;
  scrollIntoViewCount = 0;
  scrollOptions: ScrollIntoViewOptions | null = null;
  onScrollIntoView: (() => void) | null = null;
  constructor(readonly id: string) { super(); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(): void { this.focusCount += 1; }
  scrollIntoView(options: ScrollIntoViewOptions): void {
    this.scrollIntoViewCount += 1;
    this.scrollOptions = options;
    this.onScrollIntoView?.();
  }
}

function createTabFixture(vertical = false) {
  const tabs = ["graphics", "world", "audio"].map((id) => new MenuElement(id));
  const panels = tabs.map(({ id }) => new MenuElement(`${id}-panel`));
  tabs.forEach((tab, index) => tab.setAttribute("aria-controls", panels[index].id));
  tabs[0].setAttribute("aria-selected", "true");
  const list = new MenuElement("tabs");
  if (vertical) list.setAttribute("aria-orientation", "vertical");
  const tabList = Object.assign(list, {
    querySelectorAll: () => tabs,
    ownerDocument: { getElementById: (id: string) => panels.find((panel) => panel.id === id) ?? null }
  }) as unknown as HTMLElement;
  const abort = new AbortController();
  const selected: string[] = [];
  const navigation = createMenuTabs(tabList, { signal: abort.signal, onSelect: (id) => selected.push(id) });
  function key(index: number, value: string) {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: value });
    tabs[index].dispatchEvent(event);
    return event;
  }
  return { list, tabs, panels, abort, selected, navigation, key };
}

export const menuNavigationTests = [
  {
    name: "menu tabs keep selection, focus order, and hidden panels in agreement",
    run: () => {
      const { tabs, panels, selected, navigation } = createTabFixture();
      assert.deepEqual(tabs.map((tab) => tab.tabIndex), [0, -1, -1]);
      assert.deepEqual(panels.map((panel) => panel.hidden), [false, true, true]);
      tabs[1].dispatchEvent(new Event("click"));
      assert.equal(navigation.selectedId, "world");
      assert.deepEqual(tabs.map((tab) => tab.getAttribute("aria-selected")), ["false", "true", "false"]);
      assert.deepEqual(tabs.map((tab) => tab.classes.has("is-active")), [false, true, false]);
      assert.deepEqual(tabs.map((tab) => tab.tabIndex), [-1, 0, -1]);
      assert.deepEqual(panels.map((panel) => panel.hidden), [true, false, true]);
      navigation.focusActive();
      assert.equal(tabs[1].focusCount, 1);
      navigation.select("world");
      assert.deepEqual(selected, ["world"], "selecting the same tab must not repeat owner side effects");
    }
  },
  {
    name: "menu tab arrows wrap and Home/End focus the selected tab",
    run: () => {
      const { navigation, key, tabs } = createTabFixture();
      assert.equal(key(0, "ArrowLeft").defaultPrevented, true);
      assert.equal(navigation.selectedId, "audio");
      assert.equal(tabs[2].focusCount, 1);
      key(2, "ArrowRight");
      assert.equal(navigation.selectedId, "graphics");
      key(0, "End");
      assert.equal(navigation.selectedId, "audio");
      key(2, "Home");
      assert.equal(navigation.selectedId, "graphics");
      assert.equal(key(0, "ArrowDown").defaultPrevented, false, "horizontal tabs leave vertical scrolling alone");
    }
  },
  {
    name: "vertical settings tabs skip disabled choices without consuming unrelated keys",
    run: () => {
      const { tabs, navigation, key } = createTabFixture(true);
      tabs[1].disabled = true;
      key(0, "ArrowDown");
      assert.equal(navigation.selectedId, "audio");
      key(2, "ArrowDown");
      assert.equal(navigation.selectedId, "graphics");
      assert.equal(key(0, "ArrowRight").defaultPrevented, false);
      assert.equal(key(0, "Tab").defaultPrevented, false);
      navigation.select("world", true);
      navigation.select("missing", true);
      assert.equal(navigation.selectedId, "graphics");
      assert.equal(getMenuTabKeyIndex("Home", 0, 0), null);
      assert.equal(getMenuTabKeyIndex("End", -1, 3), null);
    }
  },
  {
    name: "keyboard reveals focused categories after owner updates using nearest alignment",
    run: () => {
      const { tabs, panels, selected, navigation, key } = createTabFixture(true);
      tabs[2].onScrollIntoView = () => {
        assert.deepEqual(selected, ["audio"], "the owner resets content scroll before focus is revealed");
        assert.equal(panels[2].hidden, false, "the selected panel is visible before scrolling");
      };
      key(0, "End");
      assert.equal(navigation.selectedId, "audio");
      assert.equal(tabs[2].scrollIntoViewCount, 1);
      assert.deepEqual(tabs[2].scrollOptions, { block: "nearest", inline: "nearest" });
      key(2, "Home");
      assert.equal(tabs[0].scrollIntoViewCount, 1, "Home also reveals the selected tab");
    }
  },
  {
    name: "menu tab listeners release with the runtime AbortSignal",
    run: () => {
      const { tabs, abort, navigation, key, selected } = createTabFixture();
      abort.abort();
      tabs[1].dispatchEvent(new Event("click"));
      key(0, "End");
      assert.equal(navigation.selectedId, "graphics");
      assert.deepEqual(selected, []);
    }
  },
  {
    name: "pause menu keeps settings and debug controls in their labeled panels",
    run: () => {
      const html = readFileSync("index.html", "utf8");
      const main = readFileSync("src/main.ts", "utf8");
      const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      assert.equal(new Set(allIds).size, allIds.length, "every DOM ID must be unique");
      const expected: Record<string, string[]> = {
        graphics: ["quality-select", "render-distance-slider", "shadow-quality-slider", "sun-glare-slider", "sun-glare-occlusion-toggle", "cloud-shadows-toggle", "debris-shadows-toggle", "block-light-min-slider", "block-light-max-slider"],
        world: ["day-night-cycle-toggle", "time-of-day-slider", "cycle-length-slider"],
        gameplay: ["terraformer-size-slider", "core-size-slider", "core-velocity-slider", "core-bounce-slider", "core-color-slider", "core-trail-toggle", "control-hints-toggle"],
        audio: ["sound-enabled-toggle", "master-volume-slider", "sfx-volume-slider", "ui-volume-slider"],
        physics: ["physics-budget-decrease", "physics-budget-increase", "physics-budget-slider", "debris-count-slider", "ground-debris-budget-slider", "ground-debris-lifetime-slider", "ground-debris-lifetime-forever-toggle", "despawn-objects-button"],
        experimental: ["super-ultra-toggle"]
      };
      const categories = Object.keys(expected);
      for (const [index, category] of categories.entries()) {
        const start = html.indexOf(`id="settings-${category}-panel"`);
        const end = index + 1 < categories.length ? html.indexOf(`id="settings-${categories[index + 1]}-panel"`) : html.indexOf('id="pause-inventory-panel"');
        assert.ok(start >= 0 && end > start, `${category} panel has ordered boundaries`);
        const panel = html.slice(start, end);
        assert.match(panel, new RegExp(`aria-labelledby="settings-tab-${category}"`));
        for (const control of expected[category]) {
          assert.equal(panel.includes(`id="${control}"`), true, `${control} belongs in ${category}`);
          assert.equal(main.includes(`"#${control}"`), true, `${control} keeps its owning runtime binding`);
          const input = panel.match(new RegExp(`<input[^>]*id="${control}"[^>]*>`))?.[0];
          if (input) assert.equal(panel.includes(`for="${control}"`) || input.includes('aria-label="'), true, `${control} needs a label`);
        }
      }
      const tabListStart = html.indexOf('id="pause-tabs"');
      const tabListEnd = html.indexOf('<div class="pause-content">');
      assert.ok(tabListStart >= 0 && tabListEnd > tabListStart, "primary tab list has ordered boundaries");
      const tabList = html.slice(tabListStart, tabListEnd);
      assert.deepEqual(
        [...tabList.matchAll(/<button\s+id="([^"]+)"[\s\S]*?<\/button>/g)].map((match) => match[1]),
        ["settings-button", "inventory-button", "builder-button", "debug-button"]
      );
      const debugTab = tabList.match(/<button\s+id="debug-button"[\s\S]*?<\/button>/)?.[0] ?? "";
      assert.match(debugTab, /role="tab"/);
      assert.match(debugTab, /aria-controls="pause-debug-panel"/);
      assert.match(debugTab, /aria-selected="false"/);
      assert.match(debugTab, /tabindex="-1"/);
      const debugStart = html.indexOf('id="pause-debug-panel"');
      const debugEnd = html.indexOf('<footer class="pause-footer">');
      const settingsStart = html.indexOf('id="pause-settings-panel"');
      const settingsEnd = html.indexOf('id="pause-inventory-panel"');
      assert.ok(debugStart >= 0 && debugEnd > debugStart, "Debug panel has ordered boundaries");
      assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, "Settings panel has ordered boundaries");
      const debug = html.slice(debugStart, debugEnd);
      const settings = html.slice(settingsStart, settingsEnd);
      const debugPanelTag = html.match(/<div\s+id="pause-debug-panel"[^>]*>/)?.[0] ?? "";
      assert.match(debugPanelTag, /role="tabpanel"/);
      assert.match(debugPanelTag, /aria-labelledby="debug-button"/);
      assert.match(debugPanelTag, /\bhidden\b/);
      for (const control of ["core-aim-preview-toggle", "health-bars-toggle", "cloud-shadow-guides-toggle"]) {
        assert.equal(allIds.filter((id) => id === control).length, 1, `${control} occurs exactly once`);
        assert.equal(debug.includes(`id="${control}"`), true, `${control} belongs in Debug`);
        assert.equal(settings.includes(`id="${control}"`), false, `${control} is absent from Settings`);
        assert.equal(debug.includes(`for="${control}"`), true, `${control} keeps its label`);
        assert.equal(main.includes(`"#${control}"`), true, `${control} keeps its owning runtime binding`);
      }
      assert.match(debug, /Shortcut: F6\./);
      assert.equal((html.match(/data-app-version/g) ?? []).length, 2, "home and pause keep the release-notes entry point");
    }
  }
];
