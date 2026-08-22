/** Labeled, clamped integer input row — the standard input shape in the panels. */
export function NumberRow({
  label,
  value,
  onChange,
  min = 0,
  help,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  help?: string;
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(ev) => onChange(Math.max(min, parseInt(ev.target.value) || min))}
      />
      {help && <span className="muted">{help}</span>}
    </div>
  );
}
