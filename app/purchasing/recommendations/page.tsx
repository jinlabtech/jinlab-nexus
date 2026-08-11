"use client";

import {
	useEffect,
	useMemo,
	useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

import { useBranches } from "@/hooks/useBranches";
import { useInventory } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
	addPurchaseOrderItem,
	createPurchaseOrder,
} from "@/lib/services/purchasingService";

import { supabase } from "@/lib/supabase";

type Recommendation = {
	itemId: string;
	itemName: string;
	sku: string;

	supplierId: string | null;

	currentStock: number;
	minimumStock: number;

	suggestedQuantity: number;

	selected: boolean;
};

export default function PurchasingRecommendationsPage() {
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
		selectedSupplierId,
		setSelectedSupplierId,
	] = useState("");

	const [
		selectedBranchId,
		setSelectedBranchId,
	] = useState("");

	const [
		recommendations,
		setRecommendations,
	] = useState<Recommendation[]>([]);

	const [
		creating,
		setCreating,
	] = useState(false);

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
		suppliers,
		branchStock,

		loading: inventoryLoading,

		errorMessage:
			inventoryError,
	} = useInventory(
		currentCompanyId
	);

	const {
		branches,

		loading:
			branchesLoading,
	} = useBranches(
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

	const stockByItem =
		useMemo(() => {
			const map =
				new Map<
					string,
					number
				>();

			for (
				const stock of
				branchStock
			) {
				const current =
					map.get(
						stock.inventory_item_id
					) ?? 0;

				map.set(
					stock.inventory_item_id,
					current +
						stock.quantity
				);
			}

			return map;
		}, [branchStock]);

	useEffect(() => {
		const rows =
			items
				.map(
					(
						item
					): Recommendation | null => {
						const currentStock =
							stockByItem.get(
								item.id
							) ?? 0;

						if (
							currentStock >
							item.minimum_stock
						) {
							return null;
						}

						const target =
							Math.max(
								item.minimum_stock *
									2,

								item.minimum_stock +
									1,

								1
							);

						return {
							itemId:
								item.id,

							itemName:
								item.item_name,

							sku:
								item.sku,

							supplierId:
								item.supplier_id,

							currentStock,

							minimumStock:
								item.minimum_stock,

							suggestedQuantity:
								Math.max(
									target -
										currentStock,
									1
								),

							selected:
								false,
						};
					}
				)
				.filter(
					(
						row
					): row is Recommendation =>
						row !== null
				);

		setRecommendations(
			rows
		);
	}, [
		items,
		stockByItem,
	]);

	const visibleRecommendations =
		useMemo(() => {
			if (
				!selectedSupplierId
			) {
				return recommendations;
			}

			return recommendations.filter(
				(row) =>
					row.supplierId ===
					selectedSupplierId
			);
		}, [
			recommendations,
			selectedSupplierId,
		]);

	const selectedItems =
		visibleRecommendations.filter(
			(row) =>
				row.selected
		);

	function toggleItem(
		itemId: string
	) {
		setRecommendations(
			(current) =>
				current.map(
					(row) =>
						row.itemId ===
						itemId
							? {
									...row,

									selected:
										!row.selected,
								}
							: row
				)
		);
	}

	function changeQuantity(
		itemId: string,
		value: string
	) {
		const number =
			Number(value);

		setRecommendations(
			(current) =>
				current.map(
					(row) =>
						row.itemId ===
						itemId
							? {
									...row,

									suggestedQuantity:
										Number.isInteger(
											number
										) &&
										number > 0
											? number
											: 1,
								}
							: row
				)
		);
	}

	async function createRecommendedPO() {
		if (
			!can(
				"purchasing.create"
			)
		) {
			setPageError(
				"You do not have permission to create purchase orders."
			);

			return;
		}

		if (
			!selectedSupplierId
		) {
			setPageError(
				"Select a supplier."
			);

			return;
		}

		if (
			!selectedBranchId
		) {
			setPageError(
				"Select a receiving branch."
			);

			return;
		}

		if (
			!selectedItems.length
		) {
			setPageError(
				"Select at least one product."
			);

			return;
		}

		setCreating(true);
		setPageError("");
		setMessage("");

		try {
			const order =
				await createPurchaseOrder(
					currentCompanyId,
					{
						supplier_id:
							selectedSupplierId,

						branch_id:
							selectedBranchId,

						expected_date:
							"",

						supplier_reference:
							"",

						notes:
							"Generated from low-stock purchasing recommendations.",
					}
				);

			for (
				const recommendation of
				selectedItems
			) {
				const inventoryItem =
					items.find(
						(item) =>
							item.id ===
							recommendation.itemId
					);

				if (
					!inventoryItem
				) {
					continue;
				}

				await addPurchaseOrderItem(
					order.id,
					currentCompanyId,
					{
						inventory_item_id:
							inventoryItem.id,

						quantity_ordered:
							recommendation.suggestedQuantity,

						unit_cost:
							Number(
								inventoryItem.cost_price
							),

						tax_rate:
							15,
					}
				);
			}

			try {
				await createAuditLog({
					company_id:
						currentCompanyId,

					action:
						"create",

					module:
						"purchasing",

					record_id:
						order.id,

					description:
						`Generated ${order.purchase_order_number} from low-stock recommendations`,

					metadata: {
						supplier_id:
							selectedSupplierId,

						branch_id:
							selectedBranchId,

						item_count:
							selectedItems.length,
					},
				});
			} catch {
				// Audit failure must not
				// block PO creation.
			}

			setMessage(
				`${order.purchase_order_number} created successfully.`
			);

			router.push(
				`/purchasing/${order.id}`
			);
		} catch (error) {
			setPageError(
				error instanceof Error
					? error.message
					: "Purchase order could not be created."
			);
		} finally {
			setCreating(false);
		}
	}

	async function logout() {
		await supabase.auth.signOut();

		router.replace(
			"/login"
		);
	}

	const visibleError =
		pageError ||
		inventoryError ||
		permissionsError;

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
				<section className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="text-sm font-medium text-primary">
							Purchasing Intelligence
						</p>

						<h1 className="mt-1 text-3xl font-bold tracking-tight">
							Low Stock Recommendations
						</h1>

						<p className="mt-2 text-muted-foreground">
							Convert low-stock
							products directly into
							a draft purchase order.
						</p>
					</div>

					<Link
						href="/purchasing"
						className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium"
					>
						Purchase Orders
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

				<section className="mb-6 grid gap-4 md:grid-cols-2">
					<label className="grid gap-2">
						<span className="text-sm font-medium">
							Supplier
						</span>

						<select
							value={
								selectedSupplierId
							}
							onChange={(
								event
							) => {
								setSelectedSupplierId(
									event.target.value
								);
							}}
							className="h-10 rounded-md border bg-background px-3"
						>
							<option value="">
								Select supplier
							</option>

							{suppliers.map(
								(supplier) => (
									<option
										key={
											supplier.id
										}
										value={
											supplier.id
										}
									>
										{
											supplier.supplier_name
										}
									</option>
								)
							)}
						</select>
					</label>

					<label className="grid gap-2">
						<span className="text-sm font-medium">
							Receiving Branch
						</span>

						<select
							value={
								selectedBranchId
							}
							onChange={(
								event
							) =>
								setSelectedBranchId(
									event.target.value
								)
							}
							className="h-10 rounded-md border bg-background px-3"
						>
							<option value="">
								Select branch
							</option>

							{branches.map(
								(branch) => (
									<option
										key={
											branch.id
										}
										value={
											branch.id
										}
									>
										{
											branch.branch_name
										}
									</option>
								)
							)}
						</select>
					</label>
				</section>

				<section className="mb-6 grid gap-4 sm:grid-cols-3">
					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Low Stock
						</p>

						<p className="mt-2 text-2xl font-bold">
							{
								recommendations.length
							}
						</p>
					</div>

					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Supplier Matches
						</p>

						<p className="mt-2 text-2xl font-bold">
							{
								visibleRecommendations.length
							}
						</p>
					</div>

					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Selected
						</p>

						<p className="mt-2 text-2xl font-bold">
							{
								selectedItems.length
							}
						</p>
					</div>
				</section>

				{inventoryLoading ||
				branchesLoading ||
				permissionsLoading ? (
					<div className="rounded-xl border p-10 text-center">
						Loading recommendations...
					</div>
				) : (
					<div className="overflow-x-auto rounded-xl border">
						<table className="w-full text-sm">
							<thead className="bg-muted/40">
								<tr>
									<th className="px-4 py-3 text-left">
										Buy
									</th>

									<th className="px-4 py-3 text-left">
										Product
									</th>

									<th className="px-4 py-3 text-right">
										Current
									</th>

									<th className="px-4 py-3 text-right">
										Minimum
									</th>

									<th className="px-4 py-3 text-right">
										Buy Qty
									</th>
								</tr>
							</thead>

							<tbody className="divide-y">
								{visibleRecommendations.map(
									(row) => (
										<tr
											key={
												row.itemId
											}
										>
											<td className="px-4 py-3">
												<input
													type="checkbox"
													checked={
														row.selected
													}
													onChange={() =>
														toggleItem(
															row.itemId
														)
													}
												/>
											</td>

											<td className="px-4 py-3">
												<p className="font-medium">
													{
														row.itemName
													}
												</p>

												<p className="mt-1 text-xs text-muted-foreground">
													SKU: {" "}
													{
														row.sku
													}
												</p>
											</td>

											<td className="px-4 py-3 text-right">
												{
													row.currentStock
												}
											</td>

											<td className="px-4 py-3 text-right">
												{
													row.minimumStock
												}
											</td>

											<td className="px-4 py-3">
												<input
													type="number"
													min={1}
													step="1"
													value={
														row.suggestedQuantity
													}
													onChange={(
														event
													) =>
														changeQuantity(
															row.itemId,
															event.target.value
														)
													}
													className="ml-auto block h-10 w-24 rounded-md border bg-background px-3 text-right"
												/>
											</td>
										</tr>
									)
								)}
							</tbody>
						</table>
					</div>
				)}

				<div className="mt-6 flex flex-wrap gap-3">
					{can(
						"purchasing.create"
					) && (
						<Button
							type="button"
							disabled={
								creating ||
								selectedItems.length ===
									0
							}
							onClick={
								createRecommendedPO
							}
						>
							{creating
								? "Creating..."
								: `Create Draft PO (${selectedItems.length})`}
						</Button>
					)}

					<Link
						href="/inventory"
						className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium"
					>
						Inventory
					</Link>
				</div>
			</main>
		</DashboardLayout>
	);
}


