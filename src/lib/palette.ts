/** Open the global ⌘K command palette from anywhere (e.g. header buttons). */
export function openCommandPalette() {
  window.dispatchEvent(new Event('lucio:open-palette'));
}
