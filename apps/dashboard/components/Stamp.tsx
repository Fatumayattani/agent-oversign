import type { Status } from "@/lib/format";

const tone: Record<Status["kind"], string> = {
  allowed: "stamp-allowed",
  approved: "stamp-allowed",
  released: "stamp-allowed",
  blocked: "stamp-blocked",
  held: "stamp-held",
  waiting: "stamp-held",
  expired: "stamp-muted",
};

export function Stamp({ status, fresh = false }: { status: Status; fresh?: boolean }) {
  return <span className={`stamp ${tone[status.kind]} ${fresh ? "stamp-press" : ""}`}>{status.label}</span>;
}
