import { ibkrDemoResearchResponse } from "@nora/ibkr/demo";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { parseIbkrNewsSearch, parseIbkrNewsWidget } from "./ibkr-asset-news";

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

describe("portfolio news search", () => {
  it("reads the portal's search results, HTML headlines as text", () => {
    const raw: Schema.Json = {
      results: [
        {
          newsId: "n1",
          headLineContent: "<b>Apple</b> &amp; partners",
          source: "Reuters",
          displayTime: "Nov 7, 2025 14:00",
          conids: ["265598", 272_093, "x"],
        },
        {
          newsId: "n2",
          headlineContent: "Spelled lower case",
          time: 1000,
          source: "RGFMN",
          provider_name: "Reuters Global Financial Market News",
          main_conid: 4391,
        },
        null,
        { newsId: "n3", headLineContent: "   " },
      ],
    };
    expect(parseIbkrNewsSearch(raw)).toEqual([
      {
        id: "n1",
        title: "Apple & partners",
        source: "Reuters",
        time: "Nov 7, 2025 14:00",
        conids: [265_598, 272_093],
      },
      {
        id: "n2",
        title: "Spelled lower case",
        source: "Reuters Global Financial Market News",
        time: new Date(1_000_000),
        conids: [4391],
      },
    ]);
  });

  it.each<Schema.Json>([{}, { results: null }, { results: [] }])(
    "handles no results: %j",
    (raw) => {
      expect(parseIbkrNewsSearch(raw)).toEqual([]);
    }
  );

  it("decodes the demo's portfolio news, tagged by contract", () => {
    const response = ibkrDemoResearchResponse(
      "news2",
      "search2?type=PORTFOLIO&account=U1234567&lang=en_US&tzone=UTC"
    );
    expect(response.status).toBe(200);
    const articles = parseIbkrNewsSearch(response.body);
    expect(articles).toHaveLength(10);
    expect(articles[0]?.conids).toEqual([265_598]);
    expect(articles[0]?.time).toBeInstanceOf(Date);
    expect(
      parseIbkrNewsSearch(
        ibkrDemoResearchResponse("news2", "search2?type=MYNEWS").body
      )
    ).toEqual([]);
  });
});
