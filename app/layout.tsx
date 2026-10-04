import type {
  Metadata,
} from "next";

import NexusThemeProvider from "@/components/theme/NexusThemeProvider";
import NexusPersistentShell from "@/components/layout/NexusPersistentShell";

import "./globals.css";


export const metadata:
  Metadata = {
    title:
      "JINLAB Nexus",

    description:
      "JINLAB Nexus Business Operating System",
  };


export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      suppressHydrationWarning
    >

      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >

        <NexusThemeProvider>

          <NexusPersistentShell>
            {children}
          </NexusPersistentShell>

        </NexusThemeProvider>

      </body>

    </html>
  );
}
