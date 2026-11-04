import { redirect } from "next/navigation";
import { addMonths, monthOf, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function MonthIndex() {
  redirect(`/hr/mesic/${addMonths(monthOf(todayIso()), -1)}`);
}
