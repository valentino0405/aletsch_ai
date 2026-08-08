import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aletsch AI - Auto-Instrumented Analytics for AI-Built Apps",
  description: "Futuristic auto-instrumented analytics dashboard and insights for applications built by AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col bg-[#030307] text-zinc-100 font-sans">
        {hasClerkKey ? (
          <ClerkProvider
            appearance={{
              variables: {
                colorPrimary: "#6366f1",
                colorBackground: "#09090b",
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : (
          <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#030307]">
            <div className="max-w-md w-full p-8 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 backdrop-blur-xl shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-purple-500/5 to-transparent pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                    A
                  </div>
                  <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                    Aletsch AI
                  </span>
                </div>
                
                <h2 className="text-xl font-bold text-white mb-2">Clerk Setup Required</h2>
                <p className="text-sm text-zinc-400 mb-6">
                  To run Aletsch AI locally, please configure your Clerk API keys.
                </p>
                
                <div className="bg-black/40 rounded-lg p-4 font-mono text-xs border border-zinc-800 text-zinc-300 space-y-2 mb-6">
                  <div># Create a <span className="text-indigo-400">.env.local</span> file and add:</div>
                  <div>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...</div>
                  <div>CLERK_SECRET_KEY=sk_test_...</div>
                </div>
                
                <a
                  href="https://dashboard.clerk.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 shadow-md shadow-indigo-600/10"
                >
                  Get Clerk API Keys
                </a>
              </div>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}

