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
