import "./globals.css";

export const metadata = {
  title: "VoiceAccelerator - Text to Accelerated Audio",
  description: "Convert text to accelerated spoken audio with customizable duration and voice selection",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}