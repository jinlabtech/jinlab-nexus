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

  | "customer.view"
  | "customer.create"
  | "customer.update"
  | "customer.delete"

  | "quotation.view"
  | "quotation.create"
  | "quotation.update"
  | "quotation.delete"
  | "quotation.send"
  | "quotation.accept"

  | "sales.view"
  | "sales.create"
  | "sales.update"
  | "sales.delete"
  | "sales.confirm"
  | "sales.invoice"

  | "invoice.view"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.issue"
  | "invoice.payment"

  | "audit.view"

  | "reports.view"
  | "reports.export"

  | "settings.view"
  | "settings.manage";
