type AppInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
  onChange: (value: string) => void;
};

export default function AppInput({
  label,
  value,
  placeholder,
  type = "text",
  required = false,
  onChange,
}: AppInputProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "6px",
      }}
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        {label}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          fontSize: "15px",
        }}
      />
    </label>
  );
}
