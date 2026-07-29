/**
 * Hotfix Sprint, Hotfix 3 — the read/write/clear logic behind
 * hooks/use-draft-text.ts, extracted so it's regression-testable without
 * a DOM (this repo has no jsdom/testing-library; the hook itself, which
 * orchestrates this via useState/useEffect/a debounce timer, can't be
 * rendered in the test suite, but the storage logic it delegates to can
 * be tested against a plain in-memory fake).
 *
 * Storage is duck-typed ({getItem, setItem, removeItem}) so both a real
 * `window.localStorage` and a test fake satisfy it.
 */

/**
 * @param {{getItem(key:string): string|null}} storage
 * @param {string} key
 * @returns {string}
 */
export function readDraft(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

/**
 * @param {{setItem(key:string,value:string):void, removeItem(key:string):void}} storage
 * @param {string} key
 * @param {string} value
 */
export function writeDraft(storage, key, value) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // best-effort — draft recovery must never throw or block the caller
  }
}
