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
import QuotationForm from "@/components/QuotationForm";
import { Button } from "@/components/ui/button";

import { useBranches } from "@/hooks/useBranches";
import { useCustomers } from "@/hooks/useCustomers";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuotations } from "@/hooks/useQuotations";

import { createAuditLog } from "@/lib/services/auditLogService";

import {
	createQuotation,
	deleteQuotation,
} from "@/lib/services/quotationService";

import { supabase } from "@/lib/supabase";

import type {
	QuotationFormData,
} from "@/types/quotation";

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

function formatStatus(
	value: string
) {
	return value
		.split("_")
		.map(
			(part) =>
				part.charAt(0).toUpperCase() +
				part.slice(1)
		)
		.join(" ");
}

export default function QuotationsPage() {
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
		showForm,
		setShowForm,
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
		quotations,
		loading,
		errorMessage:
			quotationsError,
		refreshQuotations,
	} = useQuotations(
		currentCompanyId
	);

	const {
		customers,
	} = useCustomers(
		currentCompanyId
	);

	const {
		branches,
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
				.from("user_profile")
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

	async function createNewQuotation(
		data: QuotationFormData
	) {
		if (
			!currentCompanyId
		) {
			throw new Error(
				"Company could not be identified."
			);
		}

		if (
			!can(
				"quotation.create"
			)
		) {
			throw new Error(
				"You do not have permission to create quotations."
			);
		}

		const quotation =
			await createQuotation(
				currentCompanyId,
				data
			);

		try {
			await createAuditLog({
				company_id:
					currentCompanyId,

				action:
					"create",

				module:
					"quotations",

				record_id:
					quotation.id,

				description:
					`Created quotation: ${quotation.quotation_number}`,

				metadata: {
					quotation_number:
						quotation.quotation_number,

					customer_id:
						quotation.customer_id,

					branch_id:
						quotation.branch_id,
				},
			});
		} catch {
			// Audit failure must not block quotation creation.
		}

		setShowForm(false);

		setMessage(
			`${quotation.quotation_number} created successfully.`
		);

		await refreshQuotations();
	}

	async function removeQuotation(
		quotationId: string,
		quotationNumber: string
	) {
		const confirmed =
			window.confirm(
				`Delete draft quotation "${quotationNumber}"?`
			);

		if (!confirmed) {
			return;
		}

		try {
			await deleteQuotation(
				quotationId,
				currentCompanyId
			);

			setMessage(
				`${quotationNumber} deleted.`
			);

			await refreshQuotations();
		} catch (error) {
			setPageError(
				error instanceof Error
					? error.message
					: "Quotation could not be deleted."
			);
		}
	}

	async function logout() {
		await supabase.auth.signOut();

		router.replace(
			"/login"
		);
	}

	const customerMap =
		useMemo(() => {
			return new Map(
				customers.map(
					(customer) => [
						customer.id,
						customer.customer_name,
					]
				)
			);
		}, [customers]);

	const branchMap =
		useMemo(() => {
			return new Map(
				branches.map(
					(branch) => [
						branch.id,
						branch.branch_name,
					]
				)
			);
		}, [branches]);

	const filteredQuotations =
		useMemo(() => {
			const search =
				searchTerm
					.trim()
					.toLowerCase();

			if (!search) {
				return quotations;
			}

			return quotations.filter(
				(quotation) =>
					[
						quotation.quotation_number,
						quotation.status,
						quotation.customer_reference,
						customerMap.get(
							quotation.customer_id
						),
						branchMap.get(
							quotation.branch_id
						),
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
			quotations,
			searchTerm,
			customerMap,
			branchMap,
		]);

	const rows =
		filteredQuotations.map(
			(quotation) => [
				<div
					key={`${quotation.id}-number`}
				>
					<Link
						href={`/quotations/${quotation.id}`}
						className="font-semibold text-primary hover:underline"
					>
						{
							quotation.quotation_number
						}
					</Link>

					<p className="mt-1 text-xs text-muted-foreground">
						{
							quotation.quotation_date
						}
					</p>
				</div>,

				customerMap.get(
					quotation.customer_id
				) ?? "-",

				branchMap.get(
					quotation.branch_id
				) ?? "-",

				<span
					key={`${quotation.id}-status`}
					className="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
				>
					{formatStatus(
						quotation.status
					)}
				</span>,

				formatCurrency(
					Number(
						quotation.total_amount
					)
				),

				quotation.valid_until ??
					"-",

				<div
					key={`${quotation.id}-actions`}
					className="flex flex-wrap gap-2"
				>
					<Link
						href={`/quotations/${quotation.id}`}
						className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium"
					>
						Open
					</Link>

					{quotation.status ===
						"draft" &&
						can(
							"quotation.delete"
						) && (
							<Button
								type="button"
								size="sm"
								variant="destructive"
								onClick={() =>
									removeQuotation(
										quotation.id,
										quotation.quotation_number
									)
								}
							>
								Delete
							</Button>
						)}
				</div>,
			]
		);

	const visibleError =
		pageError ||
		quotationsError ||
		permissionsError;

	if (
		!permissionsLoading &&
		!can("quotation.view")
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
					onLogout={logout}
				/>

				<main className="p-4 sm:p-6 lg:p-8">
					<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
						<h1 className="text-xl font-semibold">
							Access denied
						</h1>

						<p className="mt-2 text-sm text-muted-foreground">
							You do not have permission
							to view quotations.
						</p>
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
							Sales
						</p>

						<h1 className="mt-1 text-3xl font-bold tracking-tight">
							Quotations
						</h1>

						<p className="mt-2 text-muted-foreground">
							Create and manage
							customer quotations.
						</p>
					</div>

					{can(
						"quotation.create"
					) &&
						!showForm && (
							<Button
								type="button"
								onClick={() => {
									setMessage("");
									setPageError("");
									setShowForm(true);
								}}
							>
								+ New Quotation
							</Button>
						)}
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

				{showForm && (
					<div className="mb-8">
						<QuotationForm
							customers={
								customers
							}
							branches={
								branches
							}
							onSave={
								createNewQuotation
							}
							onCancel={() =>
								setShowForm(
									false
								)
							}
						/>
					</div>
				)}

				<section className="mb-5 grid gap-4 sm:grid-cols-3">
					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Total Quotations
						</p>

						<p className="mt-2 text-2xl font-bold">
							{quotations.length}
						</p>
					</div>

					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Accepted
						</p>

						<p className="mt-2 text-2xl font-bold">
							{
								quotations.filter(
									(quotation) =>
										quotation.status ===
										"accepted"
								).length
							}
						</p>
					</div>

					<div className="rounded-xl border bg-card p-5">
						<p className="text-sm text-muted-foreground">
							Total Quote Value
						</p>

						<p className="mt-2 text-2xl font-bold">
							{formatCurrency(
								quotations.reduce(
									(total, quotation) =>
										total +
										Number(
											quotation.total_amount
										),
									0
								)
							)}
						</p>
					</div>
				</section>

				<section className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-semibold">
							Quotation Register
						</p>

						<p className="text-sm text-muted-foreground">
							{
								filteredQuotations.length
							}{" "}
							quotation
							{filteredQuotations.length ===
							1
								? ""
								: "s"}
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
						placeholder="Search quotations..."
						className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm"
					/>
				</section>

				{loading ||
				permissionsLoading ? (
					<div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
						Loading quotations...
					</div>
				) : (
					<DataTable
						headers={[
							"Quotation",
							"Customer",
							"Branch",
							"Status",
							"Total",
							"Valid Until",
							"Actions",
						]}
						rows={rows}
						emptyMessage="No quotations yet."
					/>
				)}
			</main>
		</DashboardLayout>
	);
}
