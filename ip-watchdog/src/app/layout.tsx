import "./globals.css";
export const metadata = { title: "IP Watchdog", description: "Global trademark monitoring" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
