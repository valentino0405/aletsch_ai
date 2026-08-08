import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030307] px-4 py-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            A
          </div>
          <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Aletsch AI
          </span>
        </div>
        
        <SignIn
          appearance={{
            elements: {
              card: "bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/80 shadow-2xl rounded-2xl",
              headerTitle: "text-white font-bold",
              headerSubtitle: "text-zinc-400",
              socialButtonsBlockButton: "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-100",
              formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/10",
              formFieldLabel: "text-zinc-300",
              formFieldInput: "bg-zinc-900/50 border border-zinc-800 text-zinc-100 focus:border-indigo-500 focus:ring-indigo-500",
              footerActionLink: "text-indigo-400 hover:text-indigo-300",
            },
          }}
        />
      </div>
    </div>
  );
}
