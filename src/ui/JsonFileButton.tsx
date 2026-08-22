/** A button that opens a JSON file picker and hands back the file's text. */
export function JsonFileButton({
  label,
  small,
  tooltip,
  onText,
  onError,
}: {
  label: string;
  small?: boolean;
  tooltip?: string;
  onText: (text: string) => void | Promise<void>;
  onError: (err: unknown) => void;
}) {
  return (
    <label style={{ minWidth: 0 }} title={tooltip}>
      <button className={small ? 'small' : undefined} style={{ pointerEvents: 'none' }}>
        {label}
      </button>
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          if (file) {
            try {
              await onText(await file.text());
            } catch (err) {
              onError(err);
            }
          }
          ev.target.value = '';
        }}
      />
    </label>
  );
}
