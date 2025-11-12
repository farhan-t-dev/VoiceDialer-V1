import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  // Simple dark mode toggle - always shows dark mode icon since we're always in dark mode
  return (
    <Button variant="ghost" size="icon" data-testid="button-theme-toggle">
      <Moon className="h-5 w-5" />
    </Button>
  );
}
