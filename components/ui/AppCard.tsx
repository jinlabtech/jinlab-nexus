type AppCardProps = {
  children: React.ReactNode;
};

export default function AppCard({
  children,
}: AppCardProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #ddd",
        borderRadius: "10px",
        padding: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {children}
    </div>
  );
}
