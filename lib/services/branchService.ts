import { supabase } from "@/lib/supabase";

import type {
  Branch,
  BranchFormData,
} from "@/types/branch";

const branchColumns =
  "id, company_id, branch_name, address, created_at";

export async function getBranches(
  companyId: string
): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branch")
    .select(branchColumns)
    .eq("company_id", companyId)
    .order("branch_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createBranch(
  companyId: string,
  branch: BranchFormData
): Promise<Branch> {
  const { data, error } = await supabase
    .from("branch")
    .insert({
      company_id: companyId,
      branch_name: branch.branch_name,
      address: branch.address || null,
    })
    .select(branchColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateBranch(
  branchId: string,
  companyId: string,
  branch: BranchFormData
): Promise<Branch> {
  const { data, error } = await supabase
    .from("branch")
    .update({
      branch_name: branch.branch_name,
      address: branch.address || null,
    })
    .eq("id", branchId)
    .eq("company_id", companyId)
    .select(branchColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteBranch(
  branchId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("branch")
    .delete()
    .eq("id", branchId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}
