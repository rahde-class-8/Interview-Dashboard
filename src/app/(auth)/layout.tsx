import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Link
        href="/login"
        className="mb-8 flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          RI
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">Recruiter Intel</span>
          <span className="text-xs text-muted-foreground">Interview dashboard</span>
        </span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
