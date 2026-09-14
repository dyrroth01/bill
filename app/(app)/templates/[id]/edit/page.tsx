import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBlocks, parseFields } from "@/lib/api";
import TemplateEditor from "@/components/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const template = await db.template.findFirst({ where: { id, userId: user.id } });
  if (!template) notFound();

  return (
    <TemplateEditor
      template={{
        id: template.id,
        name: template.name,
        description: template.description || "",
        html: template.html,
        pageFormat: template.pageFormat === "A4" ? "A4" : "A5",
        blocks: parseBlocks(template.blocks),
        fields: parseFields(template.fieldSchema),
        logoAssetId: template.logoAssetId,
        signatureAssetId: template.signatureAssetId,
        sourceType: template.sourceType,
      }}
    />
  );
}
