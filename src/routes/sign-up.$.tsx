import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up/$")({
  component: SignUpRoute,
});

function SignUpRoute() {
  return (
    <main data-screen="sign-up" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </main>
  );
}
