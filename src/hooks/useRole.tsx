import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [isTeamOwner, setIsTeamOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setIsTeamOwner(false);
      setLoading(false);
      return;
    }

    // Ensure consumers don't treat role as resolved while we fetch it
    setLoading(true);

    const fetchRole = async () => {
      try {
        // Use security definer functions to bypass RLS and prevent recursive policy issues
        const [{ data: highestRole, error: roleError }, { data: isOwnerResult, error: ownerError }] = await Promise.all([
          supabase.rpc('get_user_highest_role', { _user_id: user.id }),
          supabase.rpc('is_team_owner', { _user_id: user.id })
        ]);

        if (roleError) {
          console.warn("Error fetching role via RPC:", roleError);
        }
        if (ownerError) {
          console.warn("Error checking team ownership:", ownerError);
        }

        const ownsTeam = isOwnerResult === true;
        const fetchedRole = highestRole as string | null;

        // If user owns a team, their effective role is "owner"
        if (ownsTeam) {
          setRole("owner");
          setIsTeamOwner(true);
        } else {
          setRole(fetchedRole);
          setIsTeamOwner(false);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
        setIsTeamOwner(false);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  const isOwner = role === "owner" || isTeamOwner;
  const isAdmin = role === "admin" || isOwner;
  const canManageClients = isAdmin;
  const canViewClients = !!role; // All authenticated users with a role

  return { role, loading, isAdmin, isOwner, canManageClients, canViewClients };
}
