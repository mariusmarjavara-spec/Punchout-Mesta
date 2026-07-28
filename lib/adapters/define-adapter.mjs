/**
 * defineAdapter() — the entire "SDK" this platform needs today (Adapter
 * Platform DEL 12). Deliberately NOT a base class: an Adapter is a
 * plain object (see adapter.mjs's Adapter typedef), and inheritance
 * would only get in the way of that. This is one completeness check
 * plus registration, so a new adapter author gets an immediate, clear
 * error instead of a confusing failure three pipeline stages later.
 *
 * A heavier SDK (mock HTTP client, generated test fixtures, a scaffold
 * CLI) is deliberately NOT built here — with 4 adapters total, that
 * would be speculative generality. lib/adapters/fixtures.mjs already
 * covers the one thing a new adapter author actually needs today (a
 * reusable DayLog to test against). Revisit only if a 5th/6th adapter
 * shows the same boilerplate actually repeating.
 *
 * The four built-in adapters (registry.mjs) predate this helper and are
 * registered directly via registerAdapter() to avoid a needless
 * circular import between this file and registry.mjs — new adapters
 * should prefer defineAdapter(), see README.md.
 */
import { registerAdapter } from "./registry.mjs";

const REQUIRED_ADAPTER_METHODS = ["validate", "transform", "send", "handleResponse"];

/**
 * @param {import('./registry.mjs').AdapterDescriptor} descriptor
 * @returns {import('./adapter.mjs').Adapter}
 */
export function defineAdapter(descriptor) {
  if (!descriptor || !descriptor.name) throw new Error("defineAdapter: descriptor.name is required");
  if (!descriptor.adapter || descriptor.adapter.name !== descriptor.name) {
    throw new Error(`defineAdapter(${descriptor.name}): descriptor.adapter.name must equal descriptor.name`);
  }
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (typeof descriptor.adapter[method] !== "function") {
      throw new Error(`defineAdapter(${descriptor.name}): adapter.${method}() is required`);
    }
  }
  if (!Array.isArray(descriptor.capabilities)) {
    throw new Error(`defineAdapter(${descriptor.name}): capabilities must be an array (can be empty — see dummy-adapter.mjs)`);
  }
  if (!Array.isArray(descriptor.supportedSchemaVersions) || descriptor.supportedSchemaVersions.length === 0) {
    throw new Error(`defineAdapter(${descriptor.name}): supportedSchemaVersions must be a non-empty array`);
  }
  registerAdapter(descriptor);
  return descriptor.adapter;
}
