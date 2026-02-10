import "./globals.css";

export const metadata = {
  title: "Flok | Capacity-Aware Matching",
  description: "Hackathon dashboard for demand-aware community matching."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
