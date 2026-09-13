import type {
  Metadata,
} from "next";

import NexusThemeProvider from "@/components/theme/NexusThemeProvider";

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
          {
            children
          }
        </NexusThemeProvider>

      </body>

    </html>
  );
}
