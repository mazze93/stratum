/// <reference types="node" />
/**
 * Run the production row renderer with a DOM double that refuses HTML sinks.
 * Hostile ledger names, notes and status strings must remain literal text.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

class Element {
  className = "";
  href = "";
  textContent = "";
  children: (Element | string)[] = [];
  set innerHTML(_value: string) { throw new Error("HTML parsing is forbidden"); }
  appendChild(child: Element) { this.children.push(child); return child; }
  append(...children: (Element | string)[]) { this.children.push(...children); }
}

const html = readFileSync(new URL("../../atrium/public/home/index.html", import.meta.url), "utf8");
const source = html.match(/function row\(log, body\) \{[\s\S]*?\n\}/)?.[0];
if (!source) throw new Error("production row function missing");
const render = runInNewContext(source + "\nrow", {
  document: { createElement: () => new Element() },
  encodeURIComponent,
}) as (log: { id: string; note: string }, body: Element | string) => Element;

test("ledger-controlled strings never enter an HTML parser", () => {
  const payload = '<img src=x onerror="stealToken()">';
  const card = render({ id: payload, note: payload }, payload);
  const left = card.children[0] as Element;
  expect((left.children[0] as Element).textContent).toBe(payload);
  expect((left.children[1] as Element).textContent).toBe(payload);
  expect((card.children[1] as Element).children).toEqual([payload]);
  expect(card.href).toBe("/atrium/?log=" + encodeURIComponent(payload));
});

test("locally built status nodes retain their structure", () => {
  const status = new Element();
  status.className = "ledger-epoch";
  status.textContent = "epoch 19";
  const card = render({ id: "demo", note: "public exhibit" }, status);
  expect((card.children[1] as Element).children[0]).toBe(status);
});

test("the home page has no innerHTML assignment", () => {
  // Clearing the grid is safe but needs no HTML parser either.
  expect(html).not.toMatch(/\.innerHTML\s*=/);
});
