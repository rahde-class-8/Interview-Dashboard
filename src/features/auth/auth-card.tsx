import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{title}</h1>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
