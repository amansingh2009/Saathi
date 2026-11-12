import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { useActiveFamily } from "@/store/activeFamily";

type Family = { id: string; name: string };
type Membership = { id: string; user_id: string; role: "elderly" | "caregiver"; status: string };

export function useFamilyContext() {
  const selectedFamilyId = useActiveFamily((state) => state.familyId);
  return useQuery({
    queryKey: ["family-context", selectedFamilyId],
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return null;

      try {
        const families = await api<Family[]>("/families");
        if (!Array.isArray(families) || families.length === 0) {
          return null;
        }

        const memberPromises = families.map(async (family) => {
          try {
            const members = await api<Membership[]>(`/families/${family.id}/members`);
            const own = members.find(
              (member) => member.user_id === userId && member.status === "active"
            );
            return own ? { family, membership: own } : null;
          } catch {
            return null;
          }
        });

        const results = await Promise.all(memberPromises);
        const memberships = results.filter((item): item is { family: Family; membership: Membership } => item !== null);
        const current = memberships.find((item) => item.family.id === selectedFamilyId) ?? memberships[0] ?? null;
        return current ? { ...current, memberships } : null;
      } catch (err) {
        console.warn("Could not retrieve families context:", err);
        return null;
      }
    },
  });
}
