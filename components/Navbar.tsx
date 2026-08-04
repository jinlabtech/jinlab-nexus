"use client";

import { Button } from "@/components/ui/button";

type NavbarProps = {
  companyName: string;
  userName: string;
  onLogout: () => void;
};

export default function Navbar({
  companyName,
  userName,
  onLogout,
}: NavbarProps) {
  return (
    <header className="flex flex-col gap-4 border-b bg-background px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Current company
        </p>

        <h2 className="text-xl font-bold tracking-tight">
          {companyName || "Loading company..."}
        </h2>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <p className="text-sm font-semibold">
            {userName || "JINLAB User"}
          </p>

          <p className="text-xs text-muted-foreground">
            Signed in
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onLogout}
        >
          Logout
        </Button>
      </div>
    </header>
  );
}
