import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "启程 · Study Abroad",
  description: "把留学这件事，变成一张清晰的路线图。探索政策、院校、专业与奖学金。",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "启程 · Study Abroad",
    description: "为中国学生打造的留学决策工作台。",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "启程 · Study Abroad",
    description: "把留学这件事，变成一张清晰的路线图。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
