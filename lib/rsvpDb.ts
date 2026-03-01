// lib/rsvpDb.ts

type BuilderLike = {
  eq: (column: string, value: any) => any;
  is: (column: string, value: null) => any;
};

export function filterByInstance<T extends BuilderLike>(
  q: T,
  recurring_instance_id: string | null
): T {
  if (recurring_instance_id === null) {
    return q.is("recurring_instance_id", null) as T;
  }
  return q.eq("recurring_instance_id", recurring_instance_id) as T;
}