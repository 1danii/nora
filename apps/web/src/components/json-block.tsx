import { useSuspenseQuery } from "@tanstack/react-query";
import type { QueryKey, UseSuspenseQueryOptions } from "@tanstack/react-query";
import type { Schema } from "effect";

/** Raw JSON, for pages that show API responses before they get a real UI. */
export const JsonBlock = ({ value }: { value: Schema.Json }) => (
  <pre>{JSON.stringify(value, null, 2)}</pre>
);

/** One query's response as raw JSON. Suspends, so wrap it in its own boundary. */
export const QueryJson = <TKey extends QueryKey>({
  query,
}: {
  query: UseSuspenseQueryOptions<Schema.Json, Error, Schema.Json, TKey>;
}) => {
  const { data } = useSuspenseQuery(query);
  return <JsonBlock value={data} />;
};
