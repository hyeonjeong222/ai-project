import type { Metadata } from "next";

import { ManualLibrary } from "@/components/manuals/manual-library";

export const metadata: Metadata = { title: "매뉴얼 열람" };

export default function ManualsPage() { return <ManualLibrary />; }
