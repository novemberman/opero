import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Serif_Display, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { PublicEnvScript } from "../components/public-env-script";
import "./globals.css";

const ui = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const data = Inter({
  subsets: ["latin"],
  variable: "--font-tabular",
  display: "swap",
});

const editorial = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Opero",
    template: "%s · Opero",
  },
  description:
    "Opero is an AI-assisted Business Operating System. This environment hosts Opero X-Ray financial intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${ui.variable} ${data.variable} ${editorial.variable} antialiased`}>
        <PublicEnvScript />
        {children}
      </body>
    </html>
  );
}
