import { Badge } from "@/components/ui/badge";

export function TagList({
  items,
  empty = "None recorded",
  variant = "secondary",
}: {
  items: string[];
  empty?: string;
  variant?: "secondary" | "outline" | "accent" | "destructive";
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item}>
          <Badge variant={variant} className="whitespace-normal text-left">
            {item}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
