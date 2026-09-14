import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { getBuiltin } from "@/lib/builtin-templates";

/** Copy a built-in starter template into the user's templates. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const tpl = getBuiltin(String(body.builtinId || ""));
    if (!tpl) return NextResponse.json({ error: "Unknown built-in template" }, { status: 404 });

    const created = await db.template.create({
      data: {
        userId: user.id,
        name: tpl.name,
        description: tpl.description,
        sourceType: "builtin",
        html: tpl.html,
        fieldSchema: JSON.stringify(tpl.fields),
        blocks: JSON.stringify(tpl.blocks),
        pageFormat: tpl.pageFormat,
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (e) {
    return apiError(e);
  }
}
