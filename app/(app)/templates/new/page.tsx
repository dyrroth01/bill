import NewTemplateTabs from "@/components/NewTemplateTabs";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";
import { buildSampleContext } from "@/lib/sample-data";
import { renderBillTemplate } from "@/lib/template-engine";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const user = await getSessionUser();
  const builtins = BUILTIN_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    pageFormat: t.pageFormat,
    blocks: t.blocks,
    previewHtml: renderBillTemplate(t.html, buildSampleContext(t.blocks, {}, user)),
  }));
  return <NewTemplateTabs initialTab={tab === "import" || tab === "builtin" || tab === "ai" ? tab : "ai"} builtins={builtins} />;
}
