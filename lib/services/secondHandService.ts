import { supabase } from "@/lib/supabase";
import { secondHandErrorMessage, type SecondHandAction, type SecondHandIntegrationChoices, type SecondHandWorkspace } from "@/types/secondHand";

export async function getSecondHandWorkspace(branchId?: string): Promise<SecondHandWorkspace> {
  const { data, error } = await supabase.rpc("sh_workspace", { p_branch_id: branchId || null }).abortSignal(AbortSignal.timeout(25000));
  if (error) throw new Error(secondHandErrorMessage(error));
  if (!data || typeof data !== "object") throw new Error("The trading workspace could not be loaded.");
  return data as SecondHandWorkspace;
}

export async function secondHandAction(action: SecondHandAction, payload: Record<string, unknown>): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("sh_action", { p_action: action, p_payload: payload }).abortSignal(AbortSignal.timeout(25000));
  if (error) throw new Error(secondHandErrorMessage(error));
  return data as { id: string };
}

export async function exportSecondHandRegister(branchId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("sh_register_export", { p_branch_id: branchId }).abortSignal(AbortSignal.timeout(25000));
  if (error) throw new Error(secondHandErrorMessage(error));
  return data as Record<string, unknown>;
}

export async function getSecondHandIntegrationChoices(branchId: string, query = "", itemId?: string): Promise<SecondHandIntegrationChoices> {
  const { data, error } = await supabase.rpc("sh_integration_choices", {
    p_branch_id: branchId,
    p_query: query.trim().slice(0, 100),
    p_item_id: itemId || null,
  }).abortSignal(AbortSignal.timeout(25000));
  if (error) throw new Error(secondHandErrorMessage(error));
  if (!data || typeof data !== "object") throw new Error("The linked Nexus records could not be loaded.");
  return data as SecondHandIntegrationChoices;
}
