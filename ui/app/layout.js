import "../styles.css";

export const metadata = {
  title: "CreatHarness Studio",
  description: "Dify-style rule and agent management UI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
