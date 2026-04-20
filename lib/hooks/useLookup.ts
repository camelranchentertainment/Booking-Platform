import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export interface LookupValue {
  value: string;
  label: string;
  sort_order: number;
  color?: string | null;
}

const cache: Record<string, LookupValue[]> = {};

export function useLookup(category: string): { values: LookupValue[]; loading: boolean } {
  const [values, setValues] = useState<LookupValue[]>(cache[category] ?? []);
  const [loading, setLoading] = useState(!cache[category]);

  useEffect(() => {
    if (cache[category]) return;
    let cancelled = false;
    supabase
      .from('lookup_values')
      .select('value, label, sort_order, color')
      .eq('category', category)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as LookupValue[];
        cache[category] = rows;
        setValues(rows);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [category]);

  return { values, loading };
}
