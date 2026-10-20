import { expect, test } from "vitest";
import { phaseExportViolation } from "./phase-source";

test.each([
  'export async function phase(input: { id: string }): Promise<{ ok: true; value: { id: string } }> { assertNoTenantTransaction("phase"); return result; }',
  'export const phase = async (input: { id: string }): Promise<Result<{ id: string }, Error>> => { assertNoTenantTransaction("phase"); return result; };',
  'export function phase(input: string): Promise<void>; export function phase(input: string) { /* comment { } */ assertNoTenantTransaction("phase"); return result; }',
])(
  "finds the implementation body after nested types and overloads",
  (source) => {
    expect(phaseExportViolation(source, "phase")).toBeNull();
  }
);

test("rejects a guard after a query rather than checking only its presence", () => {
  expect(
    phaseExportViolation(
      'export async function phase() { await query(); assertNoTenantTransaction("phase"); }',
      "phase"
    )
  ).toBe("phase guard is not the first statement");
});

test("rejects a guard in a comment", () => {
  expect(
    phaseExportViolation(
      'export function phase() { /* assertNoTenantTransaction("phase"); */ return result; }',
      "phase"
    )
  ).toBe("phase guard is not the first statement");
});

test("rejects passing a tenant client to a phased export", () => {
  expect(
    phaseExportViolation(
      'export function phase(input: string, db?: TenantDb) { assertNoTenantTransaction("phase"); }',
      "phase"
    )
  ).toBe("phased function accepts TenantDb");
});

test("renaming or aliasing cannot silently remove a registered guard", () => {
  expect(
    phaseExportViolation(
      'export function renamed() { assertNoTenantTransaction("phase"); }',
      "phase"
    )
  ).toBe("missing exported function implementation");
  expect(phaseExportViolation("export const phase = other;", "phase")).toBe(
    "missing exported function implementation"
  );
});

test("templates and regex literals before an export do not hide it", () => {
  const source =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture contains literal source code.
    'const label = `person:${input.id}:${input.name}`; const pattern = /\\{/; export function phase() { assertNoTenantTransaction("phase"); }';
  expect(phaseExportViolation(source, "phase")).toBeNull();
});

test("a namespace member is not a module-level exported function", () => {
  expect(
    phaseExportViolation(
      'export namespace nested { export function phase() { assertNoTenantTransaction("phase"); } }',
      "phase"
    )
  ).toBe("missing exported function implementation");
});
