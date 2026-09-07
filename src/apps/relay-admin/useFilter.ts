import { useMemo, useState } from 'react';

/** Case-insensitive contains-filter over the visible fields of a row. */
export function useFilter<T>(items: T[] | undefined, fields: (item: T) => (string | undefined)[]) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!items) return undefined;
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      fields(item).some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [items, search, fields]);
  return { search, setSearch, filtered };
}
