import { describe, expect, it } from "vitest";
import { FARMERS_GUIDE_PAGES } from "./farmersGuide";

describe("Farmer's Guide", () => {
  it("has unique, navigable pages for every requested topic", () => {
    expect(FARMERS_GUIDE_PAGES.map((page) => page.id)).toEqual([
      "welcome", "saves", "currency", "mutations", "combat", "social", "project",
    ]);
    expect(new Set(FARMERS_GUIDE_PAGES.map((page) => page.id)).size)
      .toBe(FARMERS_GUIDE_PAGES.length);

    const copy = FARMERS_GUIDE_PAGES
      .flatMap((page) => [page.title, page.intro, ...page.sections.flatMap((section) => [section.title, section.body])])
      .join(" ");
    for (const topic of ["Local Farm", "Online Farm", "Gold", "Brains", "Mutations", "Raids", "Epic Bosses", "Discord", "GitHub", "alpha tester"])
      expect(copy.toLowerCase()).toContain(topic.toLowerCase());
  });
});
