type DashboardCardProps = {
  title: string;
  value: string;
  description?: string;
};

export default function DashboardCard({
  title,
  value,
  description,
}: DashboardCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-shadow hover:shadow-md">
      <p className="text-sm font-medium text-muted-foreground">
        {title}
      </p>

      <p className="mt-2 break-words text-2xl font-bold tracking-tight">
        {value || "-"}
      </p>

      {description && (
        <p className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
