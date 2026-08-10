type AppInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "password";
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
    <label className="grid gap-2">
      <span className="text-sm font-medium">
        {label}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
