/**
 * Whether a keystroke belongs to whatever the user is currently typing in or
 * navigating, rather than to a page-level shortcut.
 *
 * `event.target` is not always an element — an event retargeted to `document`
 * or `window` has no `closest` — so this checks before reaching for it.
 */
export function ownsKeystroke(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="combobox"]',
    ),
  );
}
