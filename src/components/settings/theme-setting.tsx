import { setThemePreference, useThemePreference } from "#/hooks/use-theme";
import { THEME_PREFERENCES, type ThemePreference } from "#/lib/theme";
import { cn } from "#/lib/utils";

const labels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Light, dark, or whatever the phone is set to. Kept on this phone only. */
export function ThemeSetting() {
  const preference = useThemePreference();
  return (
    <section className="flex flex-col gap-2" aria-labelledby="theme-heading">
      <h2 id="theme-heading" className="font-medium">
        Theme
      </h2>
      <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <legend className="sr-only">Theme</legend>
        {THEME_PREFERENCES.map((value) => (
          <label
            key={value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              preference === value
                ? "bg-background font-medium text-foreground shadow-xs"
                : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setThemePreference(value)}
              className="sr-only"
            />
            {labels[value]}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground">System follows the phone.</p>
    </section>
  );
}
