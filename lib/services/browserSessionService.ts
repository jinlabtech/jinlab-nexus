import { supabase } from "@/lib/supabase";
import { clientRequest } from "@/lib/clientRequest";

// Browser display/bootstrap only. Database policies and server APIs still authorize all data access.
export async function getBrowserUser() {
  const { data: { session }, error } = await clientRequest(supabase.auth.getSession(),
    "Your sign-in session is taking too long. Retry or sign in again.");
  return { data: { user: session?.user ?? null }, error };
}
