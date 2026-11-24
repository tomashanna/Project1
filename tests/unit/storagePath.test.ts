import { describe, expect, it } from "vitest";

import { storageObjectName } from "@/lib/storagePath";

describe("storageObjectName", () => {
  const NOW = 1_700_000_000_000;

  it("prefixes a timestamp and keeps safe names intact", () => {
    expect(storageObjectName("informe-final_v2.pdf", NOW)).toBe(`${NOW}_informe-final_v2.pdf`);
  });

  it("cannot introduce extra path segments", () => {
    const name = storageObjectName("../../otro-cliente/robo.pdf", NOW);
    expect(name).not.toContain("/");
    expect(name.startsWith(`${NOW}_.`)).toBe(false);
  });

  it("transliterates accents and replaces unsafe characters", () => {
    expect(storageObjectName("Catálogo 2026 (final).xlsx", NOW)).toBe(
      `${NOW}_Catalogo_2026__final_.xlsx`,
    );
  });

  it("caps very long names and never returns an empty name", () => {
    expect(storageObjectName("a".repeat(500) + ".txt", NOW).length).toBeLessThanOrEqual(
      String(NOW).length + 1 + 120,
    );
    expect(storageObjectName("", NOW)).toBe(`${NOW}_archivo`);
  });
});
