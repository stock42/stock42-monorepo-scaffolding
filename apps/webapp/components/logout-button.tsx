"use client";

import { CsrfResponseSchema } from "@stock42/contracts/auth";
import { Button } from "@stock42/ui/components/button";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        method: "POST",
        credentials: "same-origin",
      });
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrf.data.csrfToken },
      });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} disabled={pending}>
      <LogOut />
      Salir
    </Button>
  );
}
