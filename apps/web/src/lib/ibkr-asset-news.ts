import { Schema } from "effect";
import { decodeHTML } from "entities/decode";

const LooseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))
);
const looseText = (value: string | number | null | undefined) =>
  value === null || value === undefined
    ? undefined
    : String(value).trim() || undefined;

const decodeNews = Schema.decodeUnknownSync(
  Schema.Struct({
    news: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          content: Schema.optional(
            Schema.NullOr(
              Schema.Array(
                Schema.NullOr(
                  Schema.Struct({
                    newsId: LooseText,
                    headlineContent: LooseText,
                    source: LooseText,
                    time: LooseText,
                  })
                )
              )
            )
          ),
        })
      )
    ),
  })
);

/** A time IBKR sends as epoch seconds or ms, or as text already. */
const newsTime = (value: string | number | null | undefined) => {
  const text = looseText(value);
  if (text === undefined) {
    return;
  }
  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) {
    return text;
  }
  const timestamp = Number(text);
  const date = new Date(
    Math.abs(timestamp) < 1e12 ? timestamp * 1000 : timestamp
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Reads the company news landing widget, decoding headline entities as plain text. */
export const parseIbkrNewsWidget = (raw: Schema.Json) =>
  (decodeNews(raw).news?.content ?? []).flatMap((item, index) => {
    const headline = looseText(item?.headlineContent);
    const title =
      headline === undefined ? undefined : decodeHTML(headline).trim();
    return title
      ? [
          {
            id: looseText(item?.newsId) ?? `${index}-${title}`,
            title,
            source: looseText(item?.source),
            time: newsTime(item?.time),
          },
        ]
      : [];
  });

const decodeNewsSearch = Schema.decodeUnknownSync(
  Schema.Struct({
    results: Schema.optional(
      Schema.NullOr(
        Schema.Array(
          Schema.NullOr(
            Schema.Struct({
              newsId: LooseText,
              // The portal's search results spell it with a capital L.
              headLineContent: LooseText,
              headlineContent: LooseText,
              source: LooseText,
              /** The source's full name, e.g. "Reuters News"; `source` is its code. */
              provider_name: LooseText,
              time: LooseText,
              displayTime: LooseText,
              /** The contract the article is mainly about. */
              main_conid: LooseText,
              conids: Schema.optional(
                Schema.NullOr(
                  Schema.Array(Schema.Union([Schema.Number, Schema.String]))
                )
              ),
            })
          )
        )
      )
    ),
  })
);

/** The contracts an article is about: its main one first, then the rest. */
const articleConids = (
  main: string | number | null | undefined,
  rest: readonly (string | number)[] | null | undefined
) => {
  const conids = new Set<number>();
  for (const conid of [main, ...(rest ?? [])]) {
    const value = Number(looseText(conid));
    if (Number.isInteger(value) && value > 0) {
      conids.add(value);
    }
  }
  return [...conids];
};

/**
 * Reads `news2/search2` results (the portal's portfolio and contract news),
 * decoding headline HTML as plain text. `time` is epoch ms and
 * `displayTime` the same in the requested time zone; `main_conid` is the
 * contract an article is about, which is often another listing than the one
 * held.
 */
export const parseIbkrNewsSearch = (raw: Schema.Json) =>
  (decodeNewsSearch(raw).results ?? []).flatMap((item, index) => {
    const headline = looseText(item?.headLineContent ?? item?.headlineContent);
    const title =
      headline === undefined
        ? undefined
        : decodeHTML(headline.replaceAll(/<[^>]*>/gu, "")).trim();
    return title
      ? [
          {
            id: looseText(item?.newsId) ?? `${index}-${title}`,
            title,
            source: looseText(item?.provider_name) ?? looseText(item?.source),
            time: newsTime(item?.time ?? item?.displayTime),
            conids: articleConids(item?.main_conid, item?.conids),
          },
        ]
      : [];
  });
