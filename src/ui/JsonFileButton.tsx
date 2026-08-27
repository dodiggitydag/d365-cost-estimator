import { useRef } from 'react';

/**
 * A button that opens a JSON file picker and hands back the file's text.
 *
 * The input is driven from the button's own click handler rather than by wrapping
 * both in a <label>: a <button> is a labelable element, so a label containing one
 * resolves ITS labeled control to the button and never activates the file input —
 * the picker silently fails to open.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        className={small ? 'small' : undefined}
        title={tooltip}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
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
          // Reset so re-picking the same file fires change again.
          ev.target.value = '';
        }}
      />
    </>
  );
}
