"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("claim2_theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <svg className="theme-sun" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.25v3M12 18.75v3M4.75 4.75l2.12 2.12M17.13 17.13l2.12 2.12M2.25 12h3M18.75 12h3M4.75 19.25l2.12-2.12M17.13 6.87l2.12-2.12" />
        <circle cx="12" cy="12" r="4.25" />
      </svg>
      <svg className="theme-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.2 15.7A8.5 8.5 0 0 1 8.3 3.8 8.5 8.5 0 1 0 20.2 15.7Z" />
      </svg>
      <span className="theme-toggle-thumb">
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.7A8.5 8.5 0 0 1 8.3 3.8 8.5 8.5 0 1 0 20.2 15.7Z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.25" /><path d="M12 2.25v3M12 18.75v3M4.75 4.75l2.12 2.12M17.13 17.13l2.12 2.12M2.25 12h3M18.75 12h3M4.75 19.25l2.12-2.12M17.13 6.87l2.12-2.12" /></svg>
        )}
      </span>
    </button>
  );
}
