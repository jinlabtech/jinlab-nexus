export type Branch = {
  id: string;
  company_id: string;
  branch_name: string;
  address: string | null;
  created_at: string;
};

export type BranchFormData = {
  branch_name: string;
  address: string;
};
