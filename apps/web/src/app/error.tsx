"use client";

import { Button } from "@clubedge/ui/components/button";

/** Shown in place of a page that failed to render. */
export default function PageError(
  props: Readonly<{ error: Error & { digest?: string }; reset: () => void }>,
) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page could not be shown. Try again, or come back in a moment.
      </p>
      <Button onClick={props.reset}>Try again</Button>
    </main>
  );
}
