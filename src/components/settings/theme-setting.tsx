import { RadioChips } from "#/components/kit/radio-chips";
import { setThemePreference, useThemePreference } from "#/hooks/use-theme";
import { THEME_PREFERENCES, type ThemePreference } from "#/lib/theme";

const labels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Light, dark, or whatever the phone is set to, as three chips (radios underneath, so
 * arrow keys move between them). Kept on this phone only.
 */
export function ThemeSetting() {
  const preference = useThemePreference();
  return (
    <section className="flex flex-col" aria-labelledby="theme-heading">
      <h2 id="theme-heading" className="font-display text-title">
        Theme
      </h2>
      <RadioChips
        name="theme"
        legend="Theme"
        options={THEME_PREFERENCES.map((value) => ({ value, label: labels[value] }))}
        value={preference}
        onChange={setThemePreference}
        className="mt-1"
      />
      <p className="text-caption text-muted-foreground">System follows the phone.</p>
    </section>
  );
}
