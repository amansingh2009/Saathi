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
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Please sign in to continue.");
      const families = await api<Family[]>("/families");
      const memberships = [];
      for (const family of families) {
        const members = await api<Membership[]>(`/families/${family.id}/members`);
        const own = members.find((member) => member.user_id === userId && member.status === "active");
        if (own) memberships.push({ family, membership: own });
      }
      const current = memberships.find((item) => item.family.id === selectedFamilyId) ?? memberships[0] ?? null;
      return current ? { ...current, memberships } : null;
    },
  });
}
