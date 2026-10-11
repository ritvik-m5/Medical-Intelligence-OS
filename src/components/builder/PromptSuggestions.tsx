interface PromptSuggestionsProps {
  suggestions: string[];
  onPick: (suggestion: string) => void;
  disabled?: boolean;
  /** Shown above the chips. */
  label?: string;
}

/**
 * Prompt suggestions.
 *
 * Chips rather than cards: they are meant to be read as things you could have
 * typed, and picked in one click, without competing with the composer.
 */
export function PromptSuggestions({
  suggestions,
  onPick,
  disabled = false,
  label = 'Or start from one of these',
}: PromptSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggestions">
      <div className="suggestions-label">{label}</div>
      <div className="suggestions-row">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="suggestion"
            onClick={() => onPick(suggestion)}
            disabled={disabled}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
