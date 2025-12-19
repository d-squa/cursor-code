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

    const fetchRole = async () => {
      try {
        // Fetch ALL user roles and check if they own any teams
        const [{ data: rolesData, error: roleError }, { data: teamsData, error: teamsError }] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id),
          supabase
            .from("teams")
            .select("id")
            .eq("owner_id", user.id)
            .limit(1)
        ]);

        if (roleError) throw roleError;
        if (teamsError) throw teamsError;

        const ownsTeam = (teamsData && teamsData.length > 0);
        
        // Priority order for roles - pick highest
        const rolePriority = ["owner", "admin", "campaign_manager", "collaborator", "member", "viewer"];
        const userRoles = (rolesData ?? []).map((r: any) => r.role);
        const highestRole = rolePriority.find(r => userRoles.includes(r)) || null;

        // If user owns a team, their effective role is "owner"
        if (ownsTeam) {
          setRole("owner");
          setIsTeamOwner(true);
        } else {
          setRole(highestRole);
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
