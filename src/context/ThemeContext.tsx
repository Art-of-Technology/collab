"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useTheme as useNextTheme } from "next-themes";

interface ThemeContextType {
  theme: {
    name: string;
    palette: {
      base: {
        surface2: string;
        border: string;
      };
    };
  };
}

const defaultTheme = {
  name: "light",
  palette: {
    base: {
      surface2: "#ffffff",
      border: "#e2e8f0",
    },
  },
};

const darkTheme = {
  name: "dark",
  palette: {
    base: {
      surface2: "#1e1e1e",
      border: "#2e2e2e",
    },
  },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
});

export const useTheme = () => useContext(ThemeContext);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const { resolvedTheme } = useNextTheme();
  const [theme, setTheme] = useState(defaultTheme);

  useEffect(() => {
    // Update theme based on next-themes
    if (resolvedTheme === "dark") {
      setTheme(darkTheme);
    } else {
      setTheme(defaultTheme);
    }
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}; 