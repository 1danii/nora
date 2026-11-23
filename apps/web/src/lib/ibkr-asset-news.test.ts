import { ibkrDemoResearchResponse } from "@nora/ibkr/demo";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { parseIbkrNewsWidget } from "./ibkr-asset-news";

describe("asset news landing widget", () => {
  it("reads the mobile widget's headline fields", () => {
    const raw: Schema.Json = {
      news: {
        content: [
          {
            newsId: 123,
            headlineContent: "Company announces results",
            source: "Reuters",
            time: 1_794_870_035,
          },
          { newsId: "missing-headline", source: "Reuters" },
        ],
      },
    };
    expect(parseIbkrNewsWidget(raw)).toEqual([
      {
        id: "123",
        title: "Company announces results",
        source: "Reuters",
        time: new Date(1_794_870_035_000),
      },
    ]);
  });

  it.each<Schema.Json>([
    {},
    { news: null },
    { news: {} },
    { news: { content: null } },
    { news: { content: [] } },
  ])("handles an unavailable news widget: %j", (raw) => {
    expect(parseIbkrNewsWidget(raw)).toEqual([]);
  });

  it("skips null and blank headlines while retaining items with nullable metadata", () => {
    const articles = parseIbkrNewsWidget({
      news: {
        content: [
          null,
          { headlineContent: null },
          { headlineContent: "   " },
          { headlineContent: "&nbsp;" },
          {
            headlineContent: "Results",
            newsId: null,
            source: null,
            time: null,
          },
          { headlineContent: "Results" },
        ],
      },
    });
    expect(articles).toEqual([
      { id: "4-Results", title: "Results", source: undefined, time: undefined },
      { id: "5-Results", title: "Results", source: undefined, time: undefined },
    ]);
  });

  it("decodes named and numeric HTML entities into headline text", () => {
    const [article] = parseIbkrNewsWidget({
      news: {
        content: [
          {
            headlineContent:
              "AT&amp;T&#39;s &quot;results&quot; &#x2014; &euro;",
          },
        ],
      },
    });
    expect(article?.title).toBe('AT&T\'s "results" — €');
  });

  it.each<[string | number | null, Date | string | undefined]>([
    [1_794_870_035, new Date(1_794_870_035_000)],
    [1_794_870_035_000, new Date(1_794_870_035_000)],
    ["1794870035", new Date(1_794_870_035_000)],
    ["1794870035000", new Date(1_794_870_035_000)],
    [" 2026-11-17T10:00:00Z ", "2026-11-17T10:00:00Z"],
    ["", undefined],
    ["  ", undefined],
    [null, undefined],
    [1e20, undefined],
    [-1e20, undefined],
    [0, new Date(0)],
  ])(
    "normalizes time %j without creating an invalid date",
    (time, expected) => {
      const [article] = parseIbkrNewsWidget({
        news: { content: [{ headlineContent: "Results", time }] },
      });
      expect(article?.time).toEqual(expected);
    }
  );

  it("decodes the demo landing response using the same widget shape", () => {
    const response = ibkrDemoResearchResponse(
      "news2",
      "landing/265598?widgets=news&lang=en"
    );
    expect(response.status).toBe(200);
    const articles = parseIbkrNewsWidget(response.body);
    expect(articles).toHaveLength(6);
    expect(articles[0]?.time).toBeInstanceOf(Date);
    expect(
      ibkrDemoResearchResponse("fundamentals", "landing/265598?widgets=news")
        .status
    ).toBe(404);
  });
});
