export type PermissionName =
  | "dashboard.view"

  | "company.view"
  | "company.create"
  | "company.update"
  | "company.delete"

  | "branch.view"
  | "branch.create"
  | "branch.update"
  | "branch.delete"

  | "user.view"
  | "user.invite"
  | "user.update"

  | "inventory.view"
  | "inventory.create"
  | "inventory.update"
  | "inventory.delete"
  | "inventory.stock.adjust"

  | "supplier.view"
  | "supplier.create"
  | "supplier.update"
  | "supplier.delete"

  | "purchasing.view"
  | "purchasing.create"
  | "purchasing.update"
  | "purchasing.delete"
  | "purchasing.submit"
  | "purchasing.approve"
  | "purchasing.receive"

  | "audit.view"

  | "reports.view"
  | "reports.export"

  | "settings.view"
  | "settings.manage";
