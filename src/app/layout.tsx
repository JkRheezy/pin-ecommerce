export const metadata = {
  title: 'PIN Store',
  description: 'AI-powered PIN badge store',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
