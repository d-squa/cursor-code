/**
 * Shared helper to build Stripe customer creation params from a user's profile.
 */
export interface ProfileData {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  company_name?: string | null;
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
}

export function buildStripeCustomerParams(
  email: string,
  userId: string,
  profile: ProfileData | null,
  extraMetadata?: Record<string, string>
) {
  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined
    : undefined;

  const address =
    profile?.address_line1 || profile?.address_city || profile?.address_country
      ? {
          line1: profile.address_line1 || "",
          city: profile.address_city || "",
          state: profile.address_state || "",
          postal_code: profile.address_postal_code || "",
          country: profile.address_country || "",
        }
      : undefined;

  return {
    email,
    name,
    phone: profile?.phone || undefined,
    address,
    metadata: {
      supabase_user_id: userId,
      ...(profile?.company_name ? { company: profile.company_name } : {}),
      ...extraMetadata,
    },
  };
}

const PROFILE_SELECT =
  "first_name, last_name, phone, company_name, address_line1, address_city, address_state, address_postal_code, address_country";

export { PROFILE_SELECT };
