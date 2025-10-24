// Funnel phase mapping based on Strategy Focus
export interface PhaseTemplate {
  name: string;
  description: string;
}

export interface FunnelTemplate {
  phases: PhaseTemplate[];
  description: string;
}

export const funnelTemplates: Record<string, FunnelTemplate> = {
  "Awareness": {
    phases: [
      { name: "Reach", description: "Initial exposure" },
      { name: "Recall", description: "Brand recall" },
      { name: "Consideration", description: "Product consideration" },
      { name: "Preference", description: "Brand preference" },
      { name: "Advocacy", description: "Brand advocacy" },
    ],
    description: "Focused on building visibility and mental availability for the brand. Builds consistent exposure and credibility.",
  },
  "Market Presence": {
    phases: [
      { name: "Visibility", description: "Brand visibility" },
      { name: "Authority", description: "Industry authority" },
      { name: "Engagement", description: "Audience engagement" },
      { name: "Trust", description: "Trust building" },
      { name: "Advocacy", description: "Brand advocacy" },
    ],
    description: "Builds consistent exposure and credibility to strengthen brand equity. Encourages discovery.",
  },
  "In-App Actions": {
    phases: [
      { name: "Awareness", description: "App awareness" },
      { name: "Onboarding", description: "User onboarding" },
      { name: "Engagement", description: "In-app engagement" },
      { name: "Retention", description: "User retention" },
      { name: "Advocacy", description: "User advocacy" },
    ],
    description: "Encourages discovery, in-app activity, and long-term user retention.",
  },
  "Purchases": {
    phases: [
      { name: "Awareness", description: "Product awareness" },
      { name: "Interest", description: "Product interest" },
      { name: "Desire", description: "Purchase desire" },
      { name: "Action", description: "Purchase action" },
      { name: "Loyalty", description: "Customer loyalty" },
    ],
    description: "The classic AIDA funnel, focused on moving users from awareness to buying and retention.",
  },
  "Actions": {
    phases: [
      { name: "Exposure", description: "Brand exposure" },
      { name: "Consideration", description: "Action consideration" },
      { name: "Engagement", description: "Active engagement" },
      { name: "Conversion", description: "Action conversion" },
      { name: "Retention", description: "User retention" },
    ],
    description: "Generalized funnel emphasizing stimulating and sustaining user actions. Performance-oriented.",
  },
  "Conversions": {
    phases: [
      { name: "Attention", description: "Capture attention" },
      { name: "Interest", description: "Generate interest" },
      { name: "Intent", description: "Build intent" },
      { name: "Conversion", description: "Drive conversion" },
      { name: "Retention", description: "Retain customers" },
    ],
    description: "Performance-oriented funnel focused on stimulating intent and maximizing conversions.",
  },
  "Leads": {
    phases: [
      { name: "Awareness", description: "Lead awareness" },
      { name: "Education", description: "Lead education" },
      { name: "Interest", description: "Lead interest" },
      { name: "Submission", description: "Lead submission" },
      { name: "Nurture", description: "Lead nurturing" },
    ],
    description: "Built for trust and qualification before lead capture, followed by post-lead nurturing.",
  },
  "Revenue": {
    phases: [
      { name: "Acquisition", description: "Customer acquisition" },
      { name: "Activation", description: "Customer activation" },
      { name: "Expansion", description: "Revenue expansion" },
      { name: "Retention", description: "Customer retention" },
      { name: "Advocacy", description: "Customer advocacy" },
    ],
    description: "Focused on customer lifecycle value: gaining users, driving repeat sales, and upselling.",
  },
};

export const getDefaultPhases = (strategyFocus: string, startDate: string, endDate: string) => {
  const template = funnelTemplates[strategyFocus];
  if (!template) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const daysPerPhase = Math.floor(totalDays / 5);
  
  return template.phases.map((phase, index) => {
    const phaseStart = new Date(start);
    phaseStart.setDate(phaseStart.getDate() + (daysPerPhase * index));
    
    const phaseEnd = index === 4 
      ? new Date(end) 
      : new Date(phaseStart.getTime() + (daysPerPhase * 1000 * 60 * 60 * 24));
    
    return {
      id: `phase-${index}-${Date.now()}`,
      name: phase.name,
      startDate: phaseStart.toISOString().split('T')[0],
      endDate: phaseEnd.toISOString().split('T')[0],
      budgetPercentage: 20, // Equal 20% split for 5 phases
    };
  });
};
