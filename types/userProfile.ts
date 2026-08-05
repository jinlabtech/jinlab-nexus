export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "technician"
  | "cashier"
  | "employee"
  | "viewer";

export type UserProfile = {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: UserRole;
  created_at: string;
};

export type UpdateUserProfileData = {
  full_name: string;
  role: UserRole;
};
