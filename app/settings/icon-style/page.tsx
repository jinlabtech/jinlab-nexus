import DashboardLayout from "@/components/layout/DashboardLayout";

import IconStyleSelector from "@/components/nexus-icons/IconStyleSelector";


export default function NexusIconStylePage() {
  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-7xl p-4 md:p-8">
        <div className="mb-7">
          <p className="text-sm font-semibold text-primary">
            Settings / Appearance
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Nexus Icon Style
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Personalise the visual language
            of JINLAB Nexus independently
            from your selected colour theme.
          </p>
        </div>

        <IconStyleSelector />
      </main>
    </DashboardLayout>
  );
}
