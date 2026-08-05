import { supabase } from "@/lib/supabase";

import type {
  UpdateUserProfileData,
  UserProfile,
} from "@/types/userProfile";

const userProfileColumns =
  "id, user_id, company_id, full_name, email, role, created_at";

export async function getCompanyUsers(
  companyId: string
): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("user_profile")
    .select(userProfileColumns)
    .eq("company_id", companyId)
    .order("full_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserProfile[];
}

export async function updateUserProfile(
  profileId: string,
  companyId: string,
  profile: UpdateUserProfileData
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("user_profile")
    .update({
      full_name: profile.full_name,
      role: profile.role,
    })
    .eq("id", profileId)
    .eq("company_id", companyId)
    .select(userProfileColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserProfile;
}
