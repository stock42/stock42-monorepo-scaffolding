import { readdir } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

const expectedComponents = [
  "accordion.tsx",
  "alert-dialog.tsx",
  "alert.tsx",
  "aspect-ratio.tsx",
  "attachment.tsx",
  "avatar.tsx",
  "badge.tsx",
  "breadcrumb.tsx",
  "bubble.tsx",
  "button-group.tsx",
  "button.tsx",
  "calendar.tsx",
  "card.tsx",
  "carousel.tsx",
  "chart.tsx",
  "checkbox.tsx",
  "collapsible.tsx",
  "combobox.tsx",
  "command.tsx",
  "context-menu.tsx",
  "dialog.tsx",
  "direction.tsx",
  "drawer.tsx",
  "dropdown-menu.tsx",
  "empty.tsx",
  "field.tsx",
  "hover-card.tsx",
  "input-group.tsx",
  "input-otp.tsx",
  "input.tsx",
  "item.tsx",
  "kbd.tsx",
  "label.tsx",
  "marker.tsx",
  "menubar.tsx",
  "message-scroller.tsx",
  "message.tsx",
  "native-select.tsx",
  "navigation-menu.tsx",
  "pagination.tsx",
  "popover.tsx",
  "progress.tsx",
  "radio-group.tsx",
  "resizable.tsx",
  "scroll-area.tsx",
  "select.tsx",
  "separator.tsx",
  "sheet.tsx",
  "sidebar.tsx",
  "skeleton.tsx",
  "slider.tsx",
  "sonner.tsx",
  "spinner.tsx",
  "switch.tsx",
  "table.tsx",
  "tabs.tsx",
  "textarea.tsx",
  "toggle-group.tsx",
  "toggle.tsx",
  "tooltip.tsx",
];

describe("shadcn component catalog", () => {
  test("keeps every materializable registry:ui component in packages/ui", async () => {
    const installedComponents = (await readdir(new URL("../src/components", import.meta.url)))
      .filter((file) => file.endsWith(".tsx"))
      .sort();

    expect(installedComponents).toEqual(expectedComponents);
  });
});
