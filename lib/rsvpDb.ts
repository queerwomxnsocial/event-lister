import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export function filterByInstance<T extends PostgrestFilterBuilder<any, any, any>>(
  q: T,
  recurring_instance_id: string | null
) {
  if (recurring_instance_id === null) {
    return q.is("recurring_instance_id", null);
  }
  return q.eq("recurring_instance_ids", recurring_instance_id);
}