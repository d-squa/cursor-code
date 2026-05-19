/** Campaign is approved or live — collaborators may extend structure only. */
export const POST_APPROVAL_CAMPAIGN_STATUSES = [
  "approved",
  "ready_for_push",
  "pushed_to_dsp",
  "partially_pushed",
  "live",
  "under_modification",
] as const;

export const FULL_PLAN_EDIT_TEAM_ROLES = [
  "owner",
  "admin",
  "campaign_manager",
] as const;

export const MEMBER_TEAM_ROLE = "member" as const;
export const COLLABORATOR_TEAM_ROLE = "collaborator" as const;
export const VIEWER_TEAM_ROLE = "viewer" as const;

export const TEAM_GOVERNANCE_ROLES = ["owner", "admin", "campaign_manager"] as const;

export type CampaignCapabilities = {
  canView: boolean;
  /** Full media plan edit (all steps, pre-approval builds). */
  canEditPlan: boolean;
  /** Extension mode on approved+ campaigns (add phases/markets; not budget/strategy). */
  canEditExtension: boolean;
  /** Modification requests, log action, activity log. */
  canQCWorkflow: boolean;
  canAccessCreatives: boolean;
  canApprove: boolean;
  canLaunch: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canCreatePlan: boolean;
  canSendForApproval: boolean;
  isViewer: boolean;
  isCollaborator: boolean;
  isMember: boolean;
  isCampaignManager: boolean;
};

export function isPostApprovalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (POST_APPROVAL_CAMPAIGN_STATUSES as readonly string[]).includes(status);
}

export function isViewerTeamRole(role: string | null | undefined): boolean {
  return role === VIEWER_TEAM_ROLE;
}

export function isCollaboratorTeamRole(role: string | null | undefined): boolean {
  return role === COLLABORATOR_TEAM_ROLE;
}

export type RoleUiOption = {
  value: string;
  label: string;
  description: string;
};

/** Copy for team role dropdowns (Manage Your Team → Assign member). */
export const TEAM_ROLE_UI_OPTIONS: RoleUiOption[] = [
  {
    value: "admin",
    label: "Admin",
    description:
      "Manage team members and roles. Full ActiPlan access: build, approve, launch, and delete team campaigns.",
  },
  {
    value: "campaign_manager",
    label: "Campaign Manager",
    description:
      "Build and edit any team ActiPlan, send for approval, refresh forecasts, and launch to DSP. Cannot manage team roster.",
  },
  {
    value: "member",
    label: "Member",
    description:
      "Create and edit ActiPlans you own. Cannot approve others’ plans or launch team campaigns unless you created them.",
  },
  {
    value: "collaborator",
    label: "QC (Collaborator)",
    description:
      "View-only on plans in build. After approval: extend with new phases/markets (not budget/strategy), Mesh Creatives, modification requests, and activity log.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description:
      "Read-only: view ActiPlans and downloads. Cannot edit, approve, launch, request changes, or assign creatives.",
  },
];

/** Copy for subscription role dropdowns (Settings → Subscription Users). */
export const SUBSCRIPTION_ROLE_UI_OPTIONS: RoleUiOption[] = [
  {
    value: "admin",
    label: "Admin",
    description:
      "Manage subscription users, billing, and invitations. Assign team roles under Manage Your Team.",
  },
  {
    value: "campaign_manager",
    label: "Campaign Manager",
    description:
      "Full access to the account. Use team roles to control who can build, approve, and launch ActiPlans.",
  },
  {
    value: "member",
    label: "Member",
    description:
      "Standard account access. ActiPlan permissions are set per team when you assign them on Manage Your Team.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description:
      "Sign in to view only. Cannot invite users or edit ActiPlans unless given a higher team role on a team.",
  },
  {
    value: "collaborator",
    label: "QC (Collaborator)",
    description:
      "Account access for QC staff. Set the same role on Manage Your Team to enable QC workflows and limited post-approval edits.",
  },
];

const TEAM_ROLE_UI_BY_VALUE = new Map(TEAM_ROLE_UI_OPTIONS.map((o) => [o.value, o]));
const SUBSCRIPTION_ROLE_UI_BY_VALUE = new Map(SUBSCRIPTION_ROLE_UI_OPTIONS.map((o) => [o.value, o]));

export function getTeamRoleUiOption(role: string): RoleUiOption | undefined {
  return TEAM_ROLE_UI_BY_VALUE.get(role);
}

export function getSubscriptionRoleUiOption(role: string): RoleUiOption | undefined {
  return SUBSCRIPTION_ROLE_UI_BY_VALUE.get(role);
}

export function formatTeamRoleLabel(role: string): string {
  return getTeamRoleUiOption(role)?.label ?? role.replace(/_/g, " ");
}

export function formatTeamRoleDescription(role: string): string | undefined {
  return getTeamRoleUiOption(role)?.description;
}

export function resolveCampaignCapabilities(params: {
  userId?: string;
  creatorId?: string | null;
  teamRole?: string | null;
  isTeamOwner?: boolean;
  status?: string | null;
}): CampaignCapabilities {
  const { userId, creatorId, teamRole, isTeamOwner, status } = params;
  const rejected = status === "rejected";
  const isCreator = !!userId && !!creatorId && creatorId === userId;
  const postApproval = isPostApprovalStatus(status);

  const role = teamRole ?? null;
  const isViewer = isViewerTeamRole(role) && !isTeamOwner && !isCreator;
  const isCollaborator = isCollaboratorTeamRole(role) && !isTeamOwner && !isCreator;
  const isMember = role === MEMBER_TEAM_ROLE && !isTeamOwner;
  const isCampaignManager = role === "campaign_manager" || isTeamOwner;
  const isGovernance =
    isTeamOwner ||
    role === "owner" ||
    role === "admin" ||
    role === "campaign_manager";

  const empty: CampaignCapabilities = {
    canView: false,
    canEditPlan: false,
    canEditExtension: false,
    canQCWorkflow: false,
    canAccessCreatives: false,
    canApprove: false,
    canLaunch: false,
    canDelete: false,
    canDuplicate: false,
    canCreatePlan: false,
    canSendForApproval: false,
    isViewer: false,
    isCollaborator: false,
    isMember: false,
    isCampaignManager: false,
  };

  if (!userId || rejected) {
    return empty;
  }

  if (isViewer) {
    return {
      ...empty,
      canView: true,
      isViewer: true,
    };
  }

  if (isCollaborator) {
    return {
      canView: true,
      canEditPlan: false,
      canEditExtension: postApproval,
      canQCWorkflow: true,
      canAccessCreatives: true,
      canApprove: false,
      canLaunch: false,
      canDelete: false,
      canDuplicate: false,
      canCreatePlan: false,
      canSendForApproval: false,
      isViewer: false,
      isCollaborator: true,
      isMember: false,
      isCampaignManager: false,
    };
  }

  if (isGovernance) {
    const awaitingApproval = status === "draft" || status === "awaiting_approval";
    const launchReady =
      postApproval || status === "approved" || status === "ready_for_push";

    return {
      canView: true,
      canEditPlan: true,
      canEditExtension: postApproval,
      canQCWorkflow: true,
      canAccessCreatives: true,
      canApprove: awaitingApproval,
      canLaunch: launchReady,
      canDelete: status !== "live",
      canDuplicate: true,
      canCreatePlan: true,
      canSendForApproval: true,
      isViewer: false,
      isCollaborator: false,
      isMember: false,
      isCampaignManager: true,
    };
  }

  if (isMember) {
    const canEditOwn = isCreator;
    const launchReady =
      isCreator &&
      (postApproval || status === "approved" || status === "ready_for_push");

    return {
      canView: true,
      canEditPlan: canEditOwn,
      canEditExtension: canEditOwn && postApproval,
      canQCWorkflow: true,
      canAccessCreatives: true,
      canApprove: false,
      canLaunch: launchReady,
      canDelete: isCreator && status !== "live",
      canDuplicate: canEditOwn,
      canCreatePlan: true,
      canSendForApproval: canEditOwn,
      isViewer: false,
      isCollaborator: false,
      isMember: true,
      isCampaignManager: false,
    };
  }

  // Unknown role — view only if they can see the campaign in the app
  return {
    ...empty,
    canView: true,
  };
}

/** @deprecated Use resolveCampaignCapabilities().canEditPlan */
export function canUserEditCampaign(params: {
  userId: string | undefined;
  creatorId?: string | null;
  teamRole?: string | null;
  isTeamOwner?: boolean;
  status?: string | null;
}): boolean {
  return resolveCampaignCapabilities(params).canEditPlan;
}

export const CAMPAIGN_EDIT_TEAM_ROLES = FULL_PLAN_EDIT_TEAM_ROLES;

export function teamRoleCanEditCampaign(role: string | null | undefined): boolean {
  if (!role) return false;
  return (FULL_PLAN_EDIT_TEAM_ROLES as readonly string[]).includes(role);
}
