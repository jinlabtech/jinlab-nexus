"use client";

import {
	useEffect,
	useMemo,
	useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import DataTable from "@/components/DataTable";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import { useArchivedInventory } from "@/hooks/useArchivedInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";
import { restoreInventoryItem } from "@/lib/services/inventoryService";
import { supabase } from "@/lib/supabase";

import type {
	InventoryItem,
} from "@/types/inventory";

function formatCurrency(
	value: number
) {
	return new Intl.NumberFormat(
		"en-ZA",
		{
			style: "currency",
			currency: "ZAR",
		}
	).format(value);
}

function calculateMargin(
	costPrice: number,
	sellingPrice: number
) {
	if (sellingPrice <= 0) {
		return 0;
	}

	return (
		((sellingPrice - costPrice) /
			sellingPrice) *
		100
	);
}

export default function ArchivedInventoryPage() {
	const router = useRouter();

	const [
		currentCompanyId,
		setCurrentCompanyId,
	] = useState("");

	const [
		companyName,
		setCompanyName,
	] = useState("JINLAB");

	const [
		userName,
		setUserName,
	] = useState("JINLAB Admin");

	const [
		searchTerm,
		setSearchTerm,
	] = useState("");

	const [
		message,
		setMessage,
	] = useState("");

	const [
		pageError,
		setPageError,
	] = useState("");

	const {
		items,
		loading,
		errorMessage:
			archivedError,
		refreshArchivedInventory,
	} = useArchivedInventory(
		currentCompanyId
	);

	const {
		can,
		loading:
			permissionsLoading,
		errorMessage:
			permissionsError,
	} = usePermissions();

	useEffect(() => {
		async function initialisePage() {
			const {
				data: { user },
				error: userError,
			} =
				await supabase.auth.getUser();

			if (
				userError ||
				!user
			) {
				router.replace(
					"/login"
				);
				return;
			}

			const {
				data: profile,
				error: profileError,
			} = await supabase
				.from(
					"user_profile"
				)
				.select(
					"full_name, company_id"
				)
				.eq(
					"user_id",
					user.id
				)
				.single();

			if (
				profileError ||
				!profile
			) {
				setPageError(
					profileError?.message ??
						"Profile could not be loaded."
				);
				return;
			}

			setUserName(
				profile.full_name
			);

			if (
				!profile.company_id
			) {
				setPageError(
					"Your account is not linked to a company."
				);
				return;
			}

			setCurrentCompanyId(
				profile.company_id
			);

			const {
				data: company,
				error: companyError,
			} = await supabase
				.from("company")
				.select(
					"company_name"
				)
				.eq(
					"id",
					profile.company_id
				)
				.single();

			if (companyError) {
				setPageError(
					companyError.message
				);
				return;
			}

			if (
				company?.company_name
			) {
				setCompanyName(
					company.company_name
				);
			}
		}

		initialisePage();
	}, [router]);

	async function restoreItem(
		item: InventoryItem
	) {
		if (
			!can(
				"inventory.update"
			)
		) {
			setPageError(
				"You do not have permission to restore inventory items."
			);
			return;
		}

		const confirmed =
			window.confirm(
				`Restore "${item.item_name}" to active inventory?`
			);

		if (!confirmed) {
			return;
		}

		setMessage("");
		setPageError("");

		try {
			await restoreInventoryItem(
				item.id,
				currentCompanyId
			);

			try {
				await createAuditLog({
					company_id:
						currentCompanyId,

					action: "update",

					module:
						"inventory",

					record_id:
						item.id,

					description:
						`Restored inventory item: ${item.item_name}`,

					metadata: {
						item_name:
							item.item_name,

						sku:
							item.sku,
					},
				});
			} catch (error) {
				setPageError(
					error instanceof Error
						? `Item restored, but audit logging failed: ${error.message}`
						: "Item restored, but audit logging failed."
				);
			}

			setMessage(
				`${item.item_name} restored successfully.`
			);

			await refreshArchivedInventory();
		} catch (error) {
			setPageError(
				error instanceof Error
					? error.message
					: "The item could not be restored."
			);
		}
	}

	async function logout() {
		await supabase.auth.signOut();
		router.replace("/login");
	}

	const filteredItems =
		useMemo(() => {
			const search =
				searchTerm
					.trim()
					.toLowerCase();

			if (!search) {
				return items;
			}

			return items.filter(
				(item) =>
					[
						item.item_name,
						item.sku,
						item.barcode,
						item.description,
					].some(
						(value) =>
							value
								?.toLowerCase()
								.includes(
									search
								)
					)
			);
		}, [
			items,
			searchTerm,
		]);

	const rows =
		filteredItems.map(
			(item) => {
				const cost =
					Number(
						item.cost_price
					);

				const selling =
					Number(
						item.selling_price
					);

				const margin =
					calculateMargin(
						cost,
						selling
					);

				return [
					<div
						key={`${item.id}-item`}
					>
						<p className="font-semibold">
							{item.item_name}
						</p>

						<p className="mt-1 text-xs text-muted-foreground">
							SKU: {item.sku}
						</p>
					</div>,

					item.barcode || "-",

					formatCurrency(cost),

					formatCurrency(
						selling
					),

					`${margin.toFixed(
						1
					)}%`,

					<span
						key={`${item.id}-status`}
						className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
					>
						Archived
					</span>,

					<div
						key={`${item.id}-actions`}
						className="flex flex-wrap gap-2"
					>
						{can(
							"inventory.update"
						) && (
							<Button
								type="button"
								size="sm"
								onClick={() =>
									restoreItem(
										item
									)
								}
							>
								Restore
							</Button>
						)}
					</div>,
				];
			}
		);

	const visibleError =
		pageError ||
		archivedError ||
		permissionsError;

	if (
		!permissionsLoading &&
		!can(
			"inventory.view"
		)
	) {
		return (
			<DashboardLayout>
				<Navbar
					companyName={
						companyName
					}
					userName={
						userName
					}
					onLogout={
						logout
					}
				/>

				<main className="p-4 sm:p-6 lg:p-8">
					<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
						Access denied.
					</div>
				</main>
			</DashboardLayout>
		);
	}

	return (
		<DashboardLayout>
			<Navbar
				companyName={
					companyName
				}
				userName={
					userName
				}
				onLogout={logout}
			/>

			<main className="p-4 sm:p-6 lg:p-8">
				<section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-sm font-medium text-primary">
							Inventory archive
						</p>

						<h1 className="mt-1 text-3xl font-bold tracking-tight">
							Archived Items
						</h1>

						<p className="mt-2 text-muted-foreground">
							Review and restore
							inactive inventory
							items.
						</p>
					</div>

					<Link
						href="/inventory"
						className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
					>
						Inventory
					</Link>
				</section>

				{message && (
					<div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
						{message}
					</div>
				)}

				{visibleError && (
					<div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
						{visibleError}
					</div>
				)}

				<section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-semibold">
							Archived inventory
						</p>

						<p className="text-sm text-muted-foreground">
							{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
						</p>
					</div>

					<input
						type="search"
						value={
							searchTerm
						}
						onChange={(
							event
						) =>
							setSearchTerm(
								event.target.value
							)
						}
						placeholder="Search archived items..."
						className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring sm:max-w-sm"
					/>
				</section>

				{loading ||
				permissionsLoading ? (
					<div className="rounded-xl border bg-card p-10 text-center">
						Loading archived inventory...
					</div>
				) : (
					<DataTable
						headers={[
							"Item",
							"Barcode",
							"Cost",
							"Selling Price",
							"Margin",
							"Status",
							"Actions",
						]}
						rows={rows}
						emptyMessage="No archived inventory items."
					/>
				)}
			</main>
		</DashboardLayout>
	);
}
