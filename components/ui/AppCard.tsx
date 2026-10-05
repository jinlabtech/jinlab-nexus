type AppCardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function AppCard({
  children,
  className = "",
}: AppCardProps) {
  return (
    <div
      className={`nexus-app-card rounded-xl border bg-card p-5 text-card-foreground shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
